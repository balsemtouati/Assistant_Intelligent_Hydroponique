"""Index source documents and persist in vector embedding database."""

# Copyright (c) 2023 Brent Benson
#
# This file is part of [project-name], licensed under the MIT License.
# See the LICENSE file in this repository for details.

import os
from dotenv import load_dotenv

from transformers import AutoTokenizer
# LangChain packages have moved in 0.2+: prefer community/huggingface packages with fallback
try:
    from langchain_community.document_loaders import PyPDFLoader  # type: ignore
except Exception:
    from langchain.document_loaders import PyPDFLoader  # type: ignore
try:
    from langchain_text_splitters import RecursiveCharacterTextSplitter  # type: ignore
except Exception:
    from langchain.text_splitter import RecursiveCharacterTextSplitter  # type: ignore
try:
    from langchain_huggingface import HuggingFaceEmbeddings  # type: ignore
except Exception:
    from langchain.embeddings import HuggingFaceEmbeddings  # type: ignore
try:
    from langchain_community.vectorstores import Chroma  # type: ignore
except Exception:
    from langchain.vectorstores import Chroma  # type: ignore
# (Optional stores) If needed later, add optional imports here

# Load the environment variables from the .env file AFTER imports
load_dotenv()

SOURCE_DOCUMENTS = ["source_documents/combined_rag.pdf"]
COLLECTION_NAME = "doc_index"
EMBEDDING_MODEL = "all-MiniLM-L6-v2"


def main():
    print("Ingesting...")
    all_docs = ingest_docs(SOURCE_DOCUMENTS)
    print("Persisting...")
    db = generate_embed_index(all_docs)
    print("Done.")


def ingest_docs(source_documents):
    all_docs = []
    for source_doc in source_documents:
        print(source_doc)
        docs = pdf_to_chunks(source_doc)
        all_docs = all_docs + docs
    return all_docs


def pdf_to_chunks(pdf_file):
    # Use the tokenizer from the embedding model to determine the chunk size
    # so that chunks don't get truncated.
    tokenizer = AutoTokenizer.from_pretrained("sentence-transformers/all-MiniLM-L6-v2")
    text_splitter = RecursiveCharacterTextSplitter.from_huggingface_tokenizer(
        tokenizer,
        separators=["\n \n", "\n\n", "\n", " ", ""],
        chunk_size=512,
        chunk_overlap=0,
    )
    loader = PyPDFLoader(pdf_file)
    docs = loader.load_and_split(text_splitter)
    return docs


def generate_embed_index(docs):
    embeddings = HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL)
    chroma_persist_dir = os.getenv("CHROMA_PERSIST_DIR")
    if chroma_persist_dir:
        db = create_index_chroma(docs, embeddings, chroma_persist_dir)
    else:
        # You can add additional vector stores here
        raise EnvironmentError("No vector store environment variables found.")
    return db


def create_index_chroma(docs, embeddings, persist_dir):
    db = Chroma.from_documents(
        documents=docs,
        embedding=embeddings,
        collection_name=COLLECTION_NAME,
        persist_directory=persist_dir,
    )
    db.persist()
    return db


if __name__ == "__main__":
    main()
