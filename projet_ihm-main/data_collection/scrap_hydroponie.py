"""Scraping dédié à la catégorie Hydroponie de croquepousse.com

Fonctionnalités principales:
1. Extraction listing + détail fusionnée
2. Champs riches (métadonnées, sections structurées, liens, images)
3. Reprises (--resume) via fichier d'état (hash + version)
4. Déduplication & versioning (nouveaux enregistrements si contenu change)
5. Pagination automatique (page/2/, page/3/ ... ou détection bouton suivant)
6. Robustesse réseau (Session + retries + backoff + jitter)
7. Export JSONL (structure complète) + CSV (vue plate) simultanés
8. Paramètres CLI (--max-pages, --delay, --output-dir, --no-html, --limit, etc.)

Usage simple (PowerShell):
  .venv/Scripts/python.exe scrap_hydroponie.py --max-pages 3

Reprise après interruption:
  .venv/Scripts/python.exe scrap_hydroponie.py --resume

Limiter nombre d'articles traités (debug):
  .venv/Scripts/python.exe scrap_hydroponie.py --limit 5 --max-pages 1

Produire uniquement JSONL (pas de CSV):
  .venv/Scripts/python.exe scrap_hydroponie.py --no-csv

NOTE: Respectez le site. Ajustez --delay si vous augmentez --max-pages.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import random
import re
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup, Tag
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


DEFAULT_BASE_CATEGORY = "https://www.croquepousse.com/hydroponie/"
USER_AGENT = "HydroCareResearchBot/1.0 (+contact: ton_email@example.com)"
DOMAIN = urlparse(DEFAULT_BASE_CATEGORY).netloc


# ===================== DATA MODEL ===================== #
@dataclass
class Section:
    heading: Optional[str]
    level: Optional[int]
    html: str
    text: str
    word_count: int


@dataclass
class Article:
    # Listing
    url: str
    canonical_url: Optional[str]
    titre_listing: Optional[str]
    extrait_listing: Optional[str]
    date_listing: Optional[str]
    categorie_listing: Optional[str]
    image_listing_src: Optional[str]
    image_listing_alt: Optional[str]
    # Détail
    titre_article: Optional[str]
    auteur: Optional[str]
    date_publication: Optional[str]
    meta_description: Optional[str]
    categories: List[str]
    tags: List[str]
    sous_titres: List[str]
    sections: List[Section]
    contenu_texte: str
    contenu_html: Optional[str]  # Optionnel (--no-html)
    nombre_mots: int
    images_detail: List[Dict[str, str]]
    liens_internes: List[str]
    liens_sortants: List[str]
    hash_contenu: str
    version: int
    previous_hash: Optional[str]
    date_scraping: str

    def to_flat_dict(self) -> Dict[str, Any]:
        """Version aplatie pour CSV (sections / lists serialisées JSON)."""
        d = asdict(self)
        # sections devient JSON compact
        d["sections"] = json.dumps([
            {
                "heading": s.heading,
                "level": s.level,
                "word_count": s.word_count,
            }
            for s in self.sections
        ], ensure_ascii=False)
        d["categories"] = ",".join(self.categories)
        d["tags"] = ",".join(self.tags)
        d["sous_titres"] = ",".join(self.sous_titres)
        d["images_detail"] = json.dumps(self.images_detail, ensure_ascii=False)
        d["liens_internes"] = json.dumps(self.liens_internes, ensure_ascii=False)
        d["liens_sortants"] = json.dumps(self.liens_sortants, ensure_ascii=False)
        return d


# ===================== NETWORK ===================== #
def build_session(retries: int = 3, backoff: float = 0.8) -> requests.Session:
    session = requests.Session()
    retry_strategy = Retry(
        total=retries,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET", "HEAD"],
        backoff_factor=backoff,
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    session.headers.update({"User-Agent": USER_AGENT})
    return session


def polite_get(session: requests.Session, url: str, delay: float):
    time.sleep(delay + random.uniform(0, delay * 0.3))  # jitter
    resp = session.get(url, timeout=25)
    resp.raise_for_status()
    return resp


# ===================== STATE ===================== #
def load_state(path: str) -> Dict[str, Any]:
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"articles": {}}  # url -> {hash, version}


def save_state(path: str, data: Dict[str, Any]):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


# ===================== LISTING PARSE ===================== #
LISTING_SELECTORS = [
    "article",  # WordPress classique
]


def guess_page(base: str, n: int) -> str:
    if n == 1:
        return base
    base = base if base.endswith("/") else base + "/"
    return urljoin(base, f"page/{n}/")


def _to_str(val) -> str:
    if isinstance(val, str):
        return val
    if val is None:
        return ""
    # BeautifulSoup peut retourner des listes d'attributs
    if isinstance(val, (list, tuple)):
        return " ".join(_to_str(v) for v in val)
    return str(val)


def parse_listing(html: str) -> List[Dict[str, Any]]:
    soup = BeautifulSoup(html, "html.parser")
    cards: List[Dict[str, Any]] = []
    for sel in LISTING_SELECTORS:
        for art in soup.select(sel):
            link = art.select_one("h2 a, h3 a, a.more-link, a.read-more")
            if not link:
                continue
            url = _to_str(link.get("href"))
            if not url or not isinstance(url, str) or not url.startswith("http"):
                continue
            img = art.select_one("img")
            img_src = _to_str(img.get("src")) if img else None
            img_alt = _to_str(img.get("alt") or "").strip() if img else None
            excerpt_el = art.select_one(
                ".entry-summary, .post-excerpt, .excerpt, p"
            )
            excerpt = excerpt_el.get_text(" ", strip=True) if excerpt_el else None
            cat_el = art.select_one("a[rel='category tag'], .cat-links a")
            categorie_listing = cat_el.get_text(strip=True) if cat_el else None
            date_el = art.find("time")
            date_listing = None
            if date_el:
                raw_dt = date_el.get("datetime")
                if isinstance(raw_dt, str) and raw_dt.strip():
                    date_listing = raw_dt.strip()
                else:
                    date_listing = date_el.get_text(strip=True)
            cards.append(
                {
                    "url": url,
                    "titre_listing": link.get_text(strip=True),
                    "extrait_listing": excerpt,
                    "date_listing": date_listing,
                    "categorie_listing": categorie_listing,
                    "image_listing_src": img_src,
                    "image_listing_alt": img_alt,
                }
            )
    # dédup par URL (gardez premier)
    seen = set()
    uniq = []
    for c in cards:
        if c["url"] not in seen:
            uniq.append(c)
            seen.add(c["url"])
    return uniq


# ===================== DETAIL PARSE ===================== #
def sanitize(soup: BeautifulSoup):
    for el in soup.select("script, style, noscript, form, nav, header, footer, aside"):
        el.decompose()
    return soup


def extract_meta_description(soup: BeautifulSoup) -> Optional[str]:
    m = soup.find("meta", attrs={"name": "description"})
    if m and m.get("content"):
        return _to_str(m.get("content")).strip()
    og = soup.find("meta", property="og:description")
    if og and og.get("content"):
        return _to_str(og.get("content")).strip()
    return None


def split_sections(content: Optional[Tag]) -> List[Section]:
    """Découpe le contenu en sections basées sur h2/h3/h4.
    Chaque section inclut son heading (optionnel pour l'intro)."""
    if not content:
        return []
    # Construire une liste linéaire d'éléments
    children = list(content.children)
    sections: List[Section] = []
    current_nodes: List[Tag] = []
    current_heading: Optional[str] = None
    current_level: Optional[int] = None

    def flush():
        if not current_nodes and current_heading is None:
            return
        html_fragments = []
        text_parts = []
        for n in current_nodes:
            if isinstance(n, Tag):
                html_fragments.append(str(n))
                txt = n.get_text(" ", strip=True)
                if txt:
                    text_parts.append(txt)
        text = "\n".join(text_parts)
        sections.append(
            Section(
                heading=current_heading,
                level=current_level,
                html="".join(html_fragments),
                text=text,
                word_count=len(re.findall(r"\w+", text)),
            )
        )

    for ch in children:
        if isinstance(ch, Tag) and ch.name in {"h2", "h3", "h4"}:
            # nouvelle section
            flush()
            current_nodes.clear()
            current_heading = ch.get_text(" ", strip=True)
            current_level = int(ch.name[1])
        else:
            if isinstance(ch, Tag):
                current_nodes.append(ch)
    # flush final
    flush()
    return sections


def parse_detail(session: requests.Session, url: str, delay: float, keep_html: bool) -> Dict[str, Any]:
    r = polite_get(session, url, delay)
    soup = BeautifulSoup(r.text, "html.parser")
    # Capturer le titre principal AVANT nettoyage (certains headers peuvent être retirés)
    title_el = soup.select_one("h1.entry-title, h1")
    titre_article = title_el.get_text(strip=True) if title_el else None
    if not titre_article:
        # Fallback: premier strong long au-dessus du contenu
        strong_el = soup.select_one("article strong, main strong")
        if strong_el:
            cand = strong_el.get_text(strip=True)
            if len(cand.split()) > 4:
                titre_article = cand
    if titre_article:
        # Normalisation espaces / retours ligne éventuels
        titre_article = re.sub(r"\s+", " ", titre_article).strip()
    sanitize(soup)
    canonical = None
    can_el = soup.find("link", rel="canonical")
    if can_el and can_el.get("href"):
        canonical = _to_str(can_el.get("href")).strip()
    content = soup.select_one("article .entry-content, .entry-content, main") or soup.body
    # Sections
    sections = split_sections(content if isinstance(content, Tag) else None)
    sous_titres = [s.heading for s in sections if s.heading]
    # Texte global (concat sections)
    contenu_texte = "\n\n".join(s.text for s in sections)
    contenu_html = str(content) if keep_html and content else None
    # Auteur
    auteur = None
    auth_el = soup.select_one(".author a, .byline a, a[rel='author'], span.author")
    if auth_el:
        auteur = auth_el.get_text(strip=True)
    # Date
    date_publication = None
    time_el = soup.find("time")
    if time_el:
        date_publication = time_el.get("datetime") or time_el.get_text(strip=True)
    # Images
    images_detail = []
    seen = set()
    for img in content.select("img") if content else []:
        src = _to_str(img.get("src"))
        if not src or src in seen:
            continue
        images_detail.append({
            "src": src,
            "alt": _to_str(img.get("alt") or "").strip(),
        })
        seen.add(src)
    # Liens
    liens_internes = []
    liens_sortants = []
    for a in content.select("a[href]") if content else []:
        href = _to_str(a.get("href"))
        if not href or not isinstance(href, str) or not href.startswith("http"):
            continue
        if urlparse(href).netloc == DOMAIN:
            if href not in liens_internes:
                liens_internes.append(href)
        else:
            if href not in liens_sortants:
                liens_sortants.append(href)
    categories = [c.get_text(strip=True) for c in soup.select("a[rel='category tag']")]
    tags = [t.get_text(strip=True) for t in soup.select("a[rel='tag']")]
    meta_description = extract_meta_description(soup)
    word_count = len(re.findall(r"\w+", contenu_texte))
    hash_contenu = hashlib.md5((titre_article or "" + contenu_texte).encode("utf-8")).hexdigest()
    return {
        "canonical_url": canonical,
        "titre_article": titre_article,
        "auteur": auteur,
        "date_publication": date_publication,
        "meta_description": meta_description,
        "categories": categories,
        "tags": tags,
        "sous_titres": sous_titres,
        "sections": sections,
        "contenu_texte": contenu_texte,
        "contenu_html": contenu_html,
        "nombre_mots": word_count,
        "images_detail": images_detail,
        "liens_internes": liens_internes,
        "liens_sortants": liens_sortants,
        "hash_contenu": hash_contenu,
    }


# ===================== EXPORT ===================== #
def ensure_csv_header(path: str, fieldnames: List[str]):
    if not os.path.exists(path):
        with open(path, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=fieldnames)
            w.writeheader()


def append_csv(path: str, fieldnames: List[str], row: Dict[str, Any]):
    with open(path, "a", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writerow(row)


def append_jsonl(path: str, obj: Dict[str, Any]):
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(obj, ensure_ascii=False) + "\n")


# ===================== CORE CRAWL ===================== #
def crawl(args):
    session = build_session(retries=args.retries, backoff=0.7)
    output_dir = args.output_dir
    os.makedirs(output_dir, exist_ok=True)
    state_path = os.path.join(output_dir, "state_hydro_advanced.json")
    jsonl_path = os.path.join(output_dir, "hydroponie_articles.jsonl")
    csv_path = os.path.join(output_dir, "hydroponie_articles.csv")

    state = load_state(state_path) if args.resume else {"articles": {}}
    articles_state: Dict[str, Dict[str, Any]] = state["articles"]

    flat_fields = [
        "url","canonical_url","titre_listing","extrait_listing","date_listing","categorie_listing",
        "image_listing_src","image_listing_alt","titre_article","auteur","date_publication","meta_description",
        "categories","tags","sous_titres","sections","contenu_texte","contenu_html","nombre_mots",
        "images_detail","liens_internes","liens_sortants","hash_contenu","version","previous_hash","date_scraping"
    ]
    if not args.no_csv:
        ensure_csv_header(csv_path, flat_fields)

    total_new = 0
    total_updated = 0
    processed = 0

    page = 1
    while page <= args.max_pages:
        page_url = guess_page(args.base_url, page)
        try:
            resp = polite_get(session, page_url, args.delay)
        except Exception as e:
            print(f"[STOP] Erreur page {page_url}: {e}")
            break
        listings = parse_listing(resp.text)
        if not listings:
            print(f"[STOP] Aucune carte détectée page {page}")
            break
        print(f"[PAGE {page}] {len(listings)} articles trouvés")
        for blk in listings:
            if args.limit and processed >= args.limit:
                print("[LIMITE] Limite atteinte -> arrêt.")
                page = args.max_pages + 1
                break
            url = blk["url"]
            old_meta = articles_state.get(url)
            # Skip if already scraped and versioning disabled
            if old_meta and not args.versioning:
                continue
            try:
                detail = parse_detail(session, url, args.delay, keep_html=not args.no_html)
            except Exception as ex:
                print(f"  ✗ Erreur article {url}: {ex}")
                continue
            new_hash = detail["hash_contenu"]
            previous_hash = None
            version = 1
            is_update = False
            if old_meta:
                # compare hash
                if old_meta["hash"] != new_hash:
                    previous_hash = old_meta["hash"]
                    version = old_meta["version"] + 1
                    is_update = True
                else:
                    # no change -> skip if versioning mode (already captured)
                    if args.versioning:
                        continue
            art = Article(
                url=url,
                canonical_url=detail["canonical_url"],
                titre_listing=blk.get("titre_listing"),
                extrait_listing=blk.get("extrait_listing"),
                date_listing=blk.get("date_listing"),
                categorie_listing=blk.get("categorie_listing"),
                image_listing_src=blk.get("image_listing_src"),
                image_listing_alt=blk.get("image_listing_alt"),
                titre_article=detail["titre_article"],
                auteur=detail["auteur"],
                date_publication=detail["date_publication"],
                meta_description=detail["meta_description"],
                categories=detail["categories"],
                tags=detail["tags"],
                sous_titres=detail["sous_titres"],
                sections=detail["sections"],
                contenu_texte=detail["contenu_texte"],
                contenu_html=detail["contenu_html"],
                nombre_mots=detail["nombre_mots"],
                images_detail=detail["images_detail"],
                liens_internes=detail["liens_internes"],
                liens_sortants=detail["liens_sortants"],
                hash_contenu=new_hash,
                version=version,
                previous_hash=previous_hash,
                date_scraping=datetime.now(timezone.utc).isoformat(),
            )
            record_dict = asdict(art)
            # Serialisation sections -> dict plus simple pour JSONL (convert dataclasses) déjà asdict l'a fait
            append_jsonl(jsonl_path, record_dict)
            if not args.no_csv:
                append_csv(csv_path, flat_fields, art.to_flat_dict())
            # MAJ état
            articles_state[url] = {"hash": new_hash, "version": version}
            processed += 1
            if is_update:
                total_updated += 1
                print(f"  ↻ MAJ: {art.titre_article or url} (v{version})")
            else:
                total_new += 1
                print(f"  ✓ {art.titre_article or url} ({art.nombre_mots} mots)")
        # Sauvegarde état après chaque page
        save_state(state_path, {"articles": articles_state})
        page += 1

    print(
        f"Terminé. Nouveaux: {total_new} | Mises à jour: {total_updated} | Total écrit: {processed}"
    )


# ===================== CLI ===================== #
def build_parser():
    p = argparse.ArgumentParser(description="Scraper Hydroponie avancé")
    p.add_argument("--base-url", default=DEFAULT_BASE_CATEGORY, help="URL catégorie de base")
    p.add_argument("--max-pages", type=int, default=40, help="Nombre maximal de pages pagination")
    p.add_argument("--delay", type=float, default=1.2, help="Délai de base entre requêtes (avant jitter)")
    p.add_argument("--retries", type=int, default=3, help="Retries réseau HTTP")
    p.add_argument("--output-dir", default="hydro_data", help="Répertoire de sortie")
    p.add_argument("--resume", action="store_true", help="Reprendre via fichier d'état")
    p.add_argument("--versioning", action="store_true", help="Enregistrer nouvelles versions si contenu change")
    p.add_argument("--no-html", action="store_true", help="Ne pas stocker le HTML brut du contenu")
    p.add_argument("--no-csv", action="store_true", help="Ne pas générer le CSV (seulement JSONL)")
    p.add_argument("--limit", type=int, help="Limiter le nombre total d'articles traités (debug)")
    # Mode URL unique (extraction sections)
    p.add_argument("--single-url", help="Scraper uniquement une URL (ignore la pagination)")
    p.add_argument("--print-sections", action="store_true", help="Afficher le mapping {titre: texte} sur stdout")
    p.add_argument("--sections-json", help="Chemin fichier JSON pour sauvegarder les sections (par défaut: stdout seulement)")
    p.add_argument("--include-intro", action="store_true", help="Inclure la section INTRO si du texte précède le premier titre")
    # Mode bulk sections
    p.add_argument("--sections-bulk", action="store_true", help="Extraire uniquement les sections (mapping titres) pour tous les articles paginés")
    p.add_argument("--sections-out", default="sections_bulk.json", help="Fichier JSON (liste) pour le mode --sections-bulk")
    return p


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        if args.single_url:
            # Mode extraction d'une seule page avec mapping titre -> texte
            session = build_session(retries=args.retries, backoff=0.7)
            try:
                detail = parse_detail(session, args.single_url, args.delay, keep_html=not args.no_html)
            except Exception as e:
                print(f"[ERREUR] Impossible de récupérer l'URL: {e}")
                return
            sections = detail["sections"]
            mapping: Dict[str, str] = {}
            for sec in sections:
                if sec.heading is None:
                    if args.include_intro and sec.text.strip():
                        mapping["INTRO"] = sec.text.strip()
                    continue
                # fusionner si doublon de titre
                if sec.heading in mapping:
                    mapping[sec.heading] += "\n\n" + sec.text.strip()
                else:
                    mapping[sec.heading] = sec.text.strip()
            # Impression
            if args.print_sections or not args.sections_json:
                print(json.dumps({
                    "url": args.single_url,
                    "titre": detail.get("titre_article"),
                    "sections": mapping
                }, ensure_ascii=False, indent=2))
            # Sauvegarde fichier
            if args.sections_json:
                out_path = args.sections_json
                with open(out_path, "w", encoding="utf-8") as f:
                    json.dump({
                        "url": args.single_url,
                        "titre": detail.get("titre_article"),
                        "sections": mapping
                    }, f, ensure_ascii=False, indent=2)
                print(f"[OK] Sections sauvegardées dans {out_path}")
        elif args.sections_bulk:
            session = build_session(retries=args.retries, backoff=0.7)
            results = []
            page = 1
            total_articles = 0
            while page <= args.max_pages:
                page_url = guess_page(args.base_url, page)
                try:
                    resp = polite_get(session, page_url, args.delay)
                except Exception as e:
                    print(f"[STOP] Erreur page {page_url}: {e}")
                    break
                listings = parse_listing(resp.text)
                if not listings:
                    print(f"[STOP] Aucune carte détectée page {page}")
                    break
                print(f"[PAGE {page}] {len(listings)} articles trouvés (mode sections)")
                for blk in listings:
                    if args.limit and total_articles >= args.limit:
                        print("[LIMITE] Limite atteinte -> arrêt.")
                        page = args.max_pages + 1
                        break
                    url = blk['url']
                    try:
                        detail = parse_detail(session, url, args.delay, keep_html=False)
                    except Exception as ex:
                        print(f"  ✗ Erreur article {url}: {ex}")
                        continue
                    mapping: Dict[str, str] = {}
                    for sec in detail['sections']:
                        if sec.heading is None:
                            if args.include_intro and sec.text.strip():
                                mapping.setdefault("INTRO", sec.text.strip())
                            continue
                        if sec.heading in mapping:
                            mapping[sec.heading] += "\n\n" + sec.text.strip()
                        else:
                            mapping[sec.heading] = sec.text.strip()
                    results.append({
                        "url": url,
                        "titre": detail.get("titre_article"),
                        "date_publication": detail.get("date_publication"),
                        "hash": detail.get("hash_contenu"),
                        "sections": mapping
                    })
                    total_articles += 1
                    print(f"  ✓ {detail.get('titre_article') or url} -> {len(mapping)} sections")
                page += 1
            # Sauvegarde fichier
            with open(args.sections_out, 'w', encoding='utf-8') as f:
                json.dump(results, f, ensure_ascii=False, indent=2)
            print(f"[OK] {len(results)} articles sauvegardés dans {args.sections_out}")
        else:
            crawl(args)
    except KeyboardInterrupt:
        print("\n[INTERRUPTION] Arrêt demandé par l'utilisateur.")


if __name__ == "__main__":  # pragma: no cover
    main()
