"""Convertisseur JSONL -> CSV pour les fichiers d'articles (cultures ou systeme)

Usage:
  python convert_jsonl_to_csv.py --input cultures_data/cultures_articles.jsonl --output cultures_data/cultures_articles.csv
  python convert_jsonl_to_csv.py --input systeme_data/systeme_articles.jsonl --output systeme_data/systeme_articles.csv

Aplatissement:
 - Listes (categories, tags, liens_x) jointes par '|'
 - Sections: on concatène les textes des sections avec séparateur \n\n---\n\n
 - Nombre de sections et hash inclus.
 - Images globales: liste des src séparés par '|'
Option --keep-intro pour préfixer l'intro avant les sections dans le champ full_text.
"""
from __future__ import annotations
import argparse
import json
import csv
import os
from typing import Dict, Any

SEP = "|"
SECT_SEP = "\n\n---\n\n"

def load_records(path: str):
    """Charge un fichier JSONL (par défaut) ou un JSON array si détecté.

    Heuristique: si le premier caractère non espace est '[' => JSON array.
    """
    with open(path, 'r', encoding='utf-8') as f:
        start = f.read(1)
        if not start:
            return
        if start.strip().startswith('['):
            # Lire tout le fichier comme un tableau JSON
            f.seek(0)
            data = json.load(f)
            if isinstance(data, list):
                for obj in data:
                    if isinstance(obj, dict):
                        yield obj
            return
        # JSONL: revenir au début et itérer lignes
        f.seek(0)
        for line in f:
            line = line.strip()
            if not line:
                continue
            yield json.loads(line)

def article_to_row(obj: Dict[str, Any], keep_intro: bool):
    categories = SEP.join(obj.get('categories') or [])
    tags = SEP.join(obj.get('tags') or [])
    liens_internes = SEP.join(obj.get('liens_internes') or [])
    liens_sortants = SEP.join(obj.get('liens_sortants') or [])
    liens_aff = SEP.join(obj.get('liens_affiliation') or [])
    images_global = SEP.join([img.get('src','') for img in (obj.get('images_global') or [])])
    sections = obj.get('sections') or []
    # Concat sections
    section_texts = []
    if keep_intro and obj.get('intro'):
        section_texts.append(obj.get('intro'))
    for s in sections:
        txt = s.get('text')
        if txt:
            # Optionnel: inclure heading dans le texte
            heading = s.get('heading')
            if heading:
                section_texts.append(f"## {heading}\n{txt}")
            else:
                section_texts.append(txt)
    full_text = SECT_SEP.join(section_texts)
    return {
        'url': obj.get('url'),
        'slug': obj.get('slug'),
        'titre': obj.get('titre'),
        'auteur': obj.get('auteur'),
        'date_publication': obj.get('date_publication'),
        'meta_description': obj.get('meta_description'),
        'categories': categories,
        'tags': tags,
        'nombre_mots': obj.get('nombre_mots'),
        'nb_sections': len(sections),
        'hash_contenu': obj.get('hash_contenu'),
        'liens_internes': liens_internes,
        'liens_sortants': liens_sortants,
        'liens_affiliation': liens_aff,
        'images_global': images_global,
        'full_text': full_text,
        'date_scraping': obj.get('date_scraping')
    }

def convert(input_path: str, output_path: str, keep_intro: bool):
    rows = []
    for obj in load_records(input_path):
        rows.append(article_to_row(obj, keep_intro))
    if not rows:
        print("[WARN] Aucun enregistrement trouvé.")
        return
    fieldnames = list(rows[0].keys())
    os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    print(f"[OK] CSV écrit -> {output_path} ({len(rows)} lignes)")


def build_parser():
    p = argparse.ArgumentParser(description='Conversion JSONL -> CSV pour articles')
    p.add_argument('--input', required=True, help='Chemin du .jsonl source')
    p.add_argument('--output', required=True, help='Chemin du .csv destination')
    p.add_argument('--keep-intro', action='store_true', help='Inclure intro en tête du champ full_text')
    return p


def main(argv=None):
    args = build_parser().parse_args(argv)
    convert(args.input, args.output, args.keep_intro)

if __name__ == '__main__':
    main()
