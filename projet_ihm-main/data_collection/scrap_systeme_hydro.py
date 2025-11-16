"""Scraper dédié à la catégorie 'systeme-hydroponique'

Objectif: Pour chaque carte (article) listée avec le bouton 'Lire la suite',
charger la page de détail et extraire:
 - url, canonical, slug
 - titre, auteur, date_publication (time), meta_description
 - catégories, tags
 - sections (H2/H3/H4) avec texte brut + html fragment
 - introduction (texte avant premier H2) sous clef INTRO
 - listes (ul/ol) normalisées par section
 - tableaux (extraction structure simple -> rows)
 - images (src, alt) et liste d'images par section
 - liens internes / externes + ancres Amazon étiquetées
 - hash_contenu (titre + concat texte sections)
 - nombre_mots
 - date_scraping

Exports:
 1. JSONL (un enregistrement/article complet)
 2. (Optionnel) JSON sections global (--sections-json) : liste {url, titre, sections}

Usage exemple:
  .venv/Scripts/python.exe scrap_systeme_hydro.py --max-pages 2 --delay 0.9
  .venv/Scripts/python.exe scrap_systeme_hydro.py --sections-json systeme_sections.json --limit 3

"""

from __future__ import annotations
import argparse, json, os, time, random, re, hashlib
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup, Tag
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

BASE_URL = "https://www.croquepousse.com/systeme-hydroponique/"
DOMAIN = urlparse(BASE_URL).netloc
UA = "HydroCareResearchBot/1.0 (+contact: ton_email@example.com)"


def _to_str(val) -> Optional[str]:
    """Convertit une valeur arbitraire (AttributeValue, list, etc.) en str nettoyée ou None."""
    if val is None:
        return None
    try:
        s = str(val)
    except Exception:
        return None
    s = s.strip()
    return s if s else None


def build_session(retries=3, backoff=0.7):
    s = requests.Session()
    strat = Retry(total=retries, status_forcelist=[429,500,502,503,504], allowed_methods=["GET","HEAD"], backoff_factor=backoff, raise_on_status=False)
    ad = HTTPAdapter(max_retries=strat)
    s.mount("http://", ad)
    s.mount("https://", ad)
    s.headers.update({"User-Agent": UA})
    return s


def polite_get(session: requests.Session, url: str, delay: float):
    time.sleep(delay + random.uniform(0, delay*0.3))
    r = session.get(url, timeout=25)
    r.raise_for_status()
    return r


def guess_page(base: str, n: int) -> str:
    if n == 1:
        return base
    base = base if base.endswith('/') else base + '/'
    return urljoin(base, f"page/{n}/")


@dataclass
class Section:
    heading: Optional[str]
    level: Optional[int]
    html: str
    text: str
    lists: List[List[str]]
    tables: List[List[List[str]]]  # list of tables -> rows -> cells
    images: List[Dict[str,str]]
    word_count: int


@dataclass
class Article:
    url: str
    canonical_url: Optional[str]
    slug: str
    titre: Optional[str]
    auteur: Optional[str]
    date_publication: Optional[str]
    meta_description: Optional[str]
    categories: List[str]
    tags: List[str]
    intro: Optional[str]
    sections: List[Section]
    nombre_mots: int
    images_global: List[Dict[str,str]]
    liens_internes: List[str]
    liens_sortants: List[str]
    liens_affiliation: List[str]
    hash_contenu: str
    date_scraping: str


def sanitize(soup: BeautifulSoup):
    for el in soup.select("script, style, noscript, form, nav, header, footer, aside, iframe"):
        el.decompose()
    return soup


def extract_meta_description(soup: BeautifulSoup) -> Optional[str]:
    m = soup.find("meta", attrs={"name":"description"})
    if m:
        mc = _to_str(m.get("content"))
        if mc:
            return mc
    og = soup.find("meta", property="og:description")
    if og:
        oc = _to_str(og.get("content"))
        if oc:
            return oc
    return None


def split_sections(content: Tag) -> List[Section]:
    """Parcourt tous les descendants pour découper correctement même si les headings sont imbriqués dans des conteneurs.

    Logique:
      - Tout ce qui précède le premier h2/h3/h4 devient une section d'intro (heading=None)
      - Chaque h2/h3/h4 ouvre une nouvelle section; on accumule les tags jusqu'au prochain heading.
      - On ne déplace pas les noeuds dans le DOM d'origine; on reconstruit un fragment HTML à partir de str().
    """
    secs: List[Section] = []
    buffer: List[Tag] = []
    cur_heading: Optional[str] = None
    cur_level: Optional[int] = None

    heading_names = {"h2", "h3", "h4"}

    def collect_lists(root: Tag):
        res = []
        for ul in root.select(":scope > ul, :scope > ol"):
            items = [li.get_text(" ", strip=True) for li in ul.select(":scope > li")]
            if items:
                res.append(items)
        return res

    def collect_tables(root: Tag):
        tables = []
        for tbl in root.select(":scope > table"):
            rows_data = []
            for tr in tbl.select("tr"):
                cells = [c.get_text(" ", strip=True) for c in tr.select("th, td")]
                if cells:
                    rows_data.append(cells)
            if rows_data:
                tables.append(rows_data)
        return tables

    def collect_images(root: Tag):
        images = []
        seen = set()
        for img in root.select(":scope img"):
            src = _to_str(img.get("src")) or _to_str(img.get("data-lazy-src"))
            if not src or src in seen:
                continue
            images.append({"src": src, "alt": _to_str(img.get("alt")) or ""})
            seen.add(src)
        return images

    def flush():
        if not buffer and cur_heading is None:
            return
        html_doc = "".join(str(t) for t in buffer)
        soup_frag = BeautifulSoup(f"<div>{html_doc}</div>", "html.parser")
        container = soup_frag.div
        text_parts = []
        if container is not None:
            for ch in container.children:
                if isinstance(ch, Tag):
                    txt = ch.get_text(" ", strip=True)
                    if txt:
                        text_parts.append(txt)
        lists = collect_lists(container)  # type: ignore[arg-type]
        tables = collect_tables(container)  # type: ignore[arg-type]
        images = collect_images(container)  # type: ignore[arg-type]
        txt_join = "\n".join(text_parts)
        secs.append(Section(
            heading=cur_heading,
            level=cur_level,
            html=html_doc,
            text=txt_join,
            lists=lists,
            tables=tables,
            images=images,
            word_count=len(re.findall(r"\w+", txt_join))
        ))

    # Parcours en profondeur contrôlée: seulement les Tag (on ignore NavigableString explicite car get_text traitera ça).
    for el in content.descendants:
        if not isinstance(el, Tag):
            continue
        # Si on retombe sur un heading imbriqué
        if el.name in heading_names:
            # Flush précédent
            flush()
            buffer.clear()
            cur_heading = el.get_text(" ", strip=True) or None
            cur_level = int(el.name[1]) if el.name[1].isdigit() else None
        else:
            # On évite d'empiler des headings secondaires déjà capturés, mais ici filtré plus haut.
            buffer.append(el)

    flush()
    return secs


def parse_article(session: requests.Session, url: str, delay: float) -> Article:
    r = polite_get(session, url, delay)
    soup = BeautifulSoup(r.text, "html.parser")
    # Capture titre avant sanitation si besoin
    title_el = soup.select_one("h1.entry-title, h1")
    titre = title_el.get_text(strip=True) if title_el else None
    sanitize(soup)
    canonical = None
    can_el = soup.find("link", rel="canonical")
    if can_el and can_el.get("href"):
        canonical = _to_str(can_el.get("href"))
    content = soup.select_one("article .entry-content, .entry-content, main") or soup.body
    sections = split_sections(content) if content else []
    intro = None
    if sections and sections[0].heading is None:
        intro = sections[0].text or None
    # Auteur
    auteur = None
    auth_el = soup.select_one(".author a, .byline a, a[rel='author'], span.author")
    if auth_el:
        auteur = auth_el.get_text(strip=True)
    # Date
    date_publication = None
    time_el = soup.find("time")
    if time_el:
        date_publication = _to_str(time_el.get("datetime")) or _to_str(time_el.get_text(strip=True))
    meta_description = extract_meta_description(soup)
    categories = [c.get_text(strip=True) for c in soup.select("a[rel='category tag']")]
    tags = [t.get_text(strip=True) for t in soup.select("a[rel='tag']")]
    # Images globales
    images_global = []
    seen = set()
    for img in content.select("img") if content else []:
        src = _to_str(img.get("src")) or _to_str(img.get("data-lazy-src"))
        if not src or src in seen:
            continue
        alt_txt = _to_str(img.get("alt")) or ""
        images_global.append({"src": src, "alt": alt_txt})
        seen.add(src)
    liens_internes, liens_sortants, liens_aff = [], [], []
    for a in content.select("a[href]") if content else []:
        href = _to_str(a.get("href"))
        if not href or not href.startswith("http"):
            continue
        if 'amzn.to' in href or 'amazon.' in href:
            if href not in liens_aff:
                liens_aff.append(href)
        parsed = urlparse(href)
        if parsed.netloc == DOMAIN:
            if href not in liens_internes:
                liens_internes.append(href)
        else:
            if href not in liens_sortants:
                liens_sortants.append(href)
    # Build plain text
    full_text = []
    if intro:
        full_text.append(intro)
    for s in sections:
        if s.heading:
            full_text.append(s.text)
    full_concat = "\n\n".join(t for t in full_text if t)
    hash_contenu = hashlib.md5(((titre or '') + full_concat).encode('utf-8')).hexdigest()
    nombre_mots = len(re.findall(r"\w+", full_concat))
    slug = url.rstrip('/').split('/')[-1]
    return Article(
        url=url,
        canonical_url=canonical,
        slug=slug,
        titre=titre,
        auteur=auteur,
        date_publication=date_publication,
        meta_description=meta_description,
        categories=categories,
        tags=tags,
        intro=intro,
        sections=sections,
        nombre_mots=nombre_mots,
        images_global=images_global,
        liens_internes=liens_internes,
        liens_sortants=liens_sortants,
        liens_affiliation=liens_aff,
        hash_contenu=hash_contenu,
        date_scraping=datetime.now(timezone.utc).isoformat()
    )


def parse_listing(html: str) -> List[str]:
    soup = BeautifulSoup(html, 'html.parser')
    urls = []
    for art in soup.select('article'):
        link = art.select_one('h2 a, h3 a, a.more-link, a.read-more')
        if not link:
            continue
        href = _to_str(link.get('href'))
        if not href or not href.startswith('http'):
            continue
        if href not in urls:
            urls.append(href)
    return urls


def crawl(args):
    session = build_session(retries=args.retries, backoff=0.7)
    os.makedirs(args.output_dir, exist_ok=True)
    jsonl_path = os.path.join(args.output_dir, 'systeme_articles.jsonl')
    array_accum: Optional[List[dict]] = [] if args.json_file else None
    sections_accum = [] if args.sections_json else None
    total = 0
    page = 1
    while page <= args.max_pages:
        page_url = guess_page(args.base_url, page)
        try:
            resp = polite_get(session, page_url, args.delay)
        except Exception as e:
            print(f"[STOP] Erreur page {page_url}: {e}")
            break
        listing_urls = parse_listing(resp.text)
        if not listing_urls:
            print(f"[STOP] Aucune carte page {page}")
            break
        print(f"[PAGE {page}] {len(listing_urls)} articles")
        for url in listing_urls:
            if args.limit and total >= args.limit:
                print("[LIMITE] Limite atteinte -> arrêt.")
                page = args.max_pages + 1
                break
            try:
                art = parse_article(session, url, args.delay)
            except Exception as ex:
                print(f"  ✗ {url} -> {ex}")
                continue
            with open(jsonl_path, 'a', encoding='utf-8') as f:
                f.write(json.dumps(asdict(art), ensure_ascii=False) + '\n')
            if array_accum is not None:
                array_accum.append(asdict(art))
            if sections_accum is not None:
                mapping = {}
                if art.intro:
                    mapping['INTRO'] = art.intro
                for s in art.sections:
                    if s.heading:
                        if s.heading in mapping:
                            mapping[s.heading] += '\n\n' + s.text
                        else:
                            mapping[s.heading] = s.text
                sections_accum.append({
                    'url': art.url,
                    'titre': art.titre,
                    'sections': mapping,
                    'hash': art.hash_contenu
                })
            total += 1
            print(f"  ✓ {art.titre or url} ({art.nombre_mots} mots / {len(art.sections)} sections)")
        page += 1
    if sections_accum is not None:
        with open(args.sections_json, 'w', encoding='utf-8') as f:
            json.dump(sections_accum, f, ensure_ascii=False, indent=2)
        print(f"[OK] Sections sauvegardées -> {args.sections_json}")
    if array_accum is not None:
        out_name = args.json_file
        if not out_name.lower().endswith('.json'):
            out_name += '.json'
        out_path = os.path.join(args.output_dir, out_name)
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(array_accum, f, ensure_ascii=False, indent=2)
        print(f"[OK] Fichier JSON array sauvegardé -> {out_path} ({len(array_accum)} articles)")
    print(f"Terminé. Articles: {total}")


def build_parser():
    p = argparse.ArgumentParser(description="Scraper système hydroponique détaillé")
    p.add_argument('--base-url', default=BASE_URL, help='URL catégorie de base')
    p.add_argument('--max-pages', type=int, default=40)
    p.add_argument('--delay', type=float, default=1.0)
    p.add_argument('--retries', type=int, default=3)
    p.add_argument('--output-dir', default='systeme_data')
    p.add_argument('--limit', type=int, help='Limiter nombre total articles')
    p.add_argument('--sections-json', help='Exporter uniquement les sections cumulées en plus du JSONL principal')
    p.add_argument('--json-file', help='Exporter aussi toutes les données dans un seul fichier JSON (ex: systeme_all.json)')
    return p


def main(argv=None):
    args = build_parser().parse_args(argv)
    crawl(args)


if __name__ == '__main__':
    main()
