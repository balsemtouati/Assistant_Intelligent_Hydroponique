"""Convert JSON file to PDF.

This script reads a JSON file (array or JSONL format) and generates a PDF document.
Each record in the JSON file is treated as a separate section in the PDF.

Usage example:
  python json_to_pdf.py --input "substrats_data/substrats_articles.jsonl" --output "substrats_data/substrats_articles.pdf"
"""
import argparse
import json
from fpdf import FPDF
import os
import unicodedata

def load_records(path: str):
    """Load JSON records from a file (JSON array or JSONL)."""
    with open(path, 'r', encoding='utf-8') as f:
        head = f.read(1)
        if not head:
            return []
        f.seek(0)
        # JSON array
        if head == '[':
            data = json.load(f)
            if isinstance(data, list):
                return data
            raise ValueError(f"File is not a JSON array: {path}")
        # JSONL
        records = []
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                # skip bad lines but continue
                continue
        return records

def sanitize_text(text):
    """Replace unsupported characters with ASCII equivalents."""
    if not text:
        return ""
    return unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode('ascii')

def create_pdf(records, output_path):
    """Generate a PDF from JSON records."""
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    pdf.set_font("Arial", size=12)

    for record in records:
        title = sanitize_text(record.get("titre") or "Untitled")
        intro = sanitize_text(record.get("intro") or "")
        sections = record.get("sections") or []

        pdf.set_font("Arial", style="B", size=14)
        pdf.cell(0, 10, title, ln=True)
        pdf.set_font("Arial", size=12)
        pdf.multi_cell(0, 10, intro)

        for section in sections:
            heading = sanitize_text(section.get("heading") or "")
            text = sanitize_text(section.get("text") or "")
            pdf.set_font("Arial", style="B", size=12)
            pdf.cell(0, 10, heading, ln=True)
            pdf.set_font("Arial", size=12)
            pdf.multi_cell(0, 10, text)

        pdf.add_page()

    pdf.output(output_path)

def main():
    parser = argparse.ArgumentParser(description="Convert JSON file to PDF")
    parser.add_argument("--input", required=True, help="Path to the input JSON file (JSONL or JSON array)")
    parser.add_argument("--output", required=True, help="Path to the output PDF file")
    args = parser.parse_args()

    records = load_records(args.input)
    if not records:
        print(f"No records found in {args.input}")
        return

    create_pdf(records, args.output)
    print(f"PDF generated: {args.output}")

if __name__ == "__main__":
    main()