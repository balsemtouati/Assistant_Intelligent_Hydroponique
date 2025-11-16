"""Combine multiple PDF files into a single PDF.

This script reads all PDF files from specified input directories and combines them into a single output PDF.

Usage example:
  python combine_pdfs.py --input "mesures_data" "systeme_data" "substrats_data" "hydro_data" --output "combined_rag.pdf"
"""
import argparse
import os
from PyPDF2 import PdfMerger

def combine_pdfs(input_paths, output_path):
    """Combine all PDF files from input paths (files or directories) into a single PDF."""
    merger = PdfMerger()

    for path in input_paths:
        if os.path.isfile(path) and path.endswith(".pdf"):
            print(f"Adding file {path} to the combined PDF...")
            merger.append(path)
        elif os.path.isdir(path):
            print(f"Scanning directory {path} for PDF files...")
            for file_name in os.listdir(path):
                if file_name.endswith(".pdf"):
                    file_path = os.path.join(path, file_name)
                    print(f"Adding {file_path} to the combined PDF...")
                    merger.append(file_path)
        else:
            print(f"[warn] Path is neither a valid file nor directory: {path}")

    if not merger.pages:
        print("No PDF files found to combine.")
        return

    merger.write(output_path)
    merger.close()
    print(f"Combined PDF saved to {output_path}")

def main():
    parser = argparse.ArgumentParser(description="Combine multiple PDF files into a single PDF")
    parser.add_argument("--input", nargs='+', required=True, help="Input directories or files containing PDF files")
    parser.add_argument("--output", required=True, help="Path to the output combined PDF file")
    args = parser.parse_args()

    combine_pdfs(args.input, args.output)

if __name__ == "__main__":
    main()