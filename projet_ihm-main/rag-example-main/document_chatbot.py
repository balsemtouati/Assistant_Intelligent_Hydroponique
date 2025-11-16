"""Simplest script for creating retrieval pipeline and invoking an LLM.

Enhancements:
- MMR retriever for better context diversity
- General French QA prompt grounded in context with citations
- LLM-as-judge to evaluate faithfulness/completeness and optionally refine the answer
"""

# Copyright (c) 2023 Brent Benson
#
# This file is part of [project-name], licensed under the MIT License.
# See the LICENSE file in this repository for details.

import os
import json
import argparse
from dotenv import load_dotenv

try:
    from langchain_huggingface import HuggingFaceEmbeddings  # type: ignore
except Exception:
    from langchain.embeddings import HuggingFaceEmbeddings  # type: ignore
from langchain_google_genai import ChatGoogleGenerativeAI
try:
    from langchain_community.vectorstores import Chroma  # type: ignore
except Exception:
    from langchain.vectorstores import Chroma  # type: ignore

# Load the environment variables from the .env file (after imports)
load_dotenv()

# Log full text sent to LLM
VERBOSE = False

# Details of persisted embedding store index
COLLECTION_NAME = "doc_index"
EMBEDDING_MODEL = "all-MiniLM-L6-v2"

# Size of window for buffered window memory
MEMORY_WINDOW_SIZE = 10

# Judge settings
ENABLE_JUDGE = True
FAITHFULNESS_MIN = 4
COMPLETENESS_MIN = 4
MAX_CONTEXT_CHARS = 4000


def main():
    # CLI options
    parser = argparse.ArgumentParser(description="RAG chatbot (Gemini) avec reformulation sur répétition")
    parser.add_argument("--question", help="Question unique à poser (mode non interactif)")
    parser.add_argument("--interactive", action="store_true", help="Activer le mode interactif (boucle)")
    args = parser.parse_args()

    # Check which environment variables are set and use the appropriate LLM
    gemini_api_key = os.getenv("GOOGLE_API_KEY")
    gemini_model_name = os.getenv("GEMINI_MODEL_NAME", "gemini-2.5-flash")

    # Access persisted embeddings and expose through langchain retriever
    embeddings = HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL)
    db = get_embed_db(embeddings)
    # Improve retrieval diversity and relevance
    retriever = db.as_retriever(search_type="mmr", search_kwargs={"k": 6, "fetch_k": 20, "lambda_mult": 0.7})

    if gemini_api_key:
        print("Using Google Gemini for language model.")
        llm = ChatGoogleGenerativeAI(
            model=gemini_model_name,
            google_api_key=gemini_api_key,
            temperature=0.5,
            verbose=VERBOSE
        )
        # Judge model (lower temperature for evaluation)
        llm_judge = ChatGoogleGenerativeAI(
            model=gemini_model_name,
            google_api_key=gemini_api_key,
            temperature=0.1,
            verbose=VERBOSE
        )
    else:
        raise EnvironmentError("GOOGLE_API_KEY not found in environment variables.")

    # Prompt header (manual format to avoid PromptTemplate dependency)
    def build_prompt(question: str, context: str) -> str:
        return (
            "Vous êtes un assistant expert et fiable. Répondez en français, de manière claire, précise et utile,"
            " en vous appuyant uniquement sur le CONTEXTE fourni. Si une information n’est pas présente dans le contexte,"
            " dites-le explicitement et évitez toute spéculation.\n\n"
            f"Question: {question}\n\n"
            "Consignes:\n"
            "- Répondez directement à la question en 1–3 paragraphes maximum, ou en liste à puces si c’est plus clair.\n"
            "- Utilisez les informations du contexte pour donner des détails concrets (définitions, étapes, paramètres, chiffres, exemples, formules) si disponibles.\n"
            "- Si le contexte est insuffisant: indiquez précisément ce qui manque et proposez 1–2 pistes de recherche ou questions de clarification, sans inventer.\n"
            "- Évitez les généralités, répétitions et remplissage; privilégiez des phrases courtes et des listes.\n\n"
            f"Contexte:\n{context}\n\n"
            "Réponse:"
        )

    # State: suivi des répétitions pour reformuler à l'identique des infos
    asked_counts = {}

    def ask_once(user_q: str):
        key = " ".join((user_q or "").split()).lower()
        count = asked_counts.get(key, 0)
        final_q = user_q
        if count > 0:
            final_q = (
                f"{user_q}\n\n"
                "Instruction de style: c'est une répétition de la même question. "
                "Reformule la réponse (style et tournure) mais conserve STRICTEMENT toutes les informations, "
                "faits, valeurs numériques et citations de pages extraits du contexte. Ne retire aucun détail, "
                "n'ajoute rien, ne modifie aucune valeur; change uniquement la formulation."
            )
        asked_counts[key] = count + 1
        # Retrieve context docs
        docs = retriever.invoke(user_q)
        context_snippet = build_context_snippet(docs, MAX_CONTEXT_CHARS)
        # Build prompt and ask LLM
        prompt_text = build_prompt(final_q, context_snippet)
        llm_resp = llm.invoke(prompt_text)
        answer = getattr(llm_resp, "content", str(llm_resp)) or ""
        sources = docs
        # Judge and refine if enabled
        final_answer = answer
        judge_out = None
        if ENABLE_JUDGE and context_snippet:
            try:
                judge_out = judge_and_refine(
                    llm_judge=llm_judge,
                    question=user_q,
                    answer=answer,
                    context=context_snippet,
                    faith_min=FAITHFULNESS_MIN,
                    comp_min=COMPLETENESS_MIN,
                )
                if judge_out and judge_out.get("decision") == "revise" and judge_out.get("revised_answer"):
                    final_answer = judge_out["revised_answer"].strip()
            except Exception as e:
                judge_out = {"error": str(e)}

        unique_pages = []
        for doc in sources:
            page = doc.metadata.get("page_label") or doc.metadata.get("page")
            if page is not None and page not in unique_pages:
                unique_pages.append(page)

        if judge_out and ("faithfulness" in judge_out or "completeness" in judge_out):
            print("\n==== Évaluation (LLM judge) ====\n")
            f = judge_out.get("faithfulness")
            c = judge_out.get("completeness")
            d = judge_out.get("decision")
            print(f"Fidélité: {f}/5 | Complétude: {c}/5 | Décision: {d}")
            issues = judge_out.get("issues") or []
            if issues:
                print("Problèmes:")
                for it in issues[:4]:
                    print(f"- {it}")

        print("\n==== Réponse ====\n")
        print(final_answer)
        if unique_pages:
            print("\nSources: " + ", ".join([f"p. {p}" for p in unique_pages]))

    # Mode interactif vs. one-shot
    if args.interactive:
        try:
            while True:
                q = input("Question (Entrée pour quitter): ").strip()
                if not q:
                    break
                ask_once(q)
        except KeyboardInterrupt:
            pass
    else:
        default_q = "quel est la différence entre hydroponie passive et hydroponie active ?"
        ask_once(args.question or default_q)


def build_context_snippet(sources, max_chars):
    parts = []
    seen = set()
    for doc in sources:
        page = doc.metadata.get("page_label") or doc.metadata.get("page")
        key = (page, doc.page_content[:50])
        if key in seen:
            continue
        seen.add(key)
        header = f"[p. {page}]" if page is not None else "[p.?]"
        text = (doc.page_content or "").strip()
        if not text:
            continue
        # Keep snippets short to maximize diversity
        snippet = text[:800]
        parts.append(f"{header} {snippet}")
        joined = "\n\n".join(parts)
        if len(joined) >= max_chars:
            break
    return "\n\n".join(parts)[:max_chars]


def judge_and_refine(llm_judge, question, answer, context, faith_min=4, comp_min=4):
    judge_template = (
        "Vous êtes un évaluateur impartial. Évaluez la réponse par rapport UNIQUEMENT au CONTEXTE.\n"
        "- Donnez des notes de 1 à 5: faithfulness (fidélité au contexte), completeness (couverture des points essentiels).\n"
        "- Listez brièvement les problèmes (issues) si présents (max 4).\n"
        f"- decision: 'revise' si l'une des notes < {faith_min} ou < {comp_min}, sinon 'keep'.\n"
        "- Si decision='revise', proposez 'revised_answer' en français, concise et structurée, avec citations de pages (ex: p. 258), STRICTEMENT basées sur le CONTEXTE.\n"
        "Répondez en JSON EXACT avec les clés: faithfulness, completeness, issues, decision, revised_answer.\n\n"
        "Question:\n{question}\n\n"
        "Réponse:\n{answer}\n\n"
        "CONTEXTE:\n{context}\n\n"
        "JSON:" 
    )

    prompt = judge_template.format(question=question, answer=answer, context=context)
    result = llm_judge.invoke(prompt)
    text = getattr(result, "content", str(result)) or ""

    # Try strict JSON parsing, then fallback to best-effort extraction
    try:
        data = json.loads(text)
    except Exception:
        try:
            start = text.find("{")
            end = text.rfind("}")
            if start != -1 and end != -1:
                data = json.loads(text[start:end+1])
            else:
                data = {}
        except Exception:
            data = {}

    # Normalize fields
    def to_int(x):
        try:
            return int(x)
        except Exception:
            return None
    out = {
        "faithfulness": to_int(data.get("faithfulness")),
        "completeness": to_int(data.get("completeness")),
        "issues": data.get("issues") if isinstance(data.get("issues"), list) else [],
        "decision": data.get("decision"),
        "revised_answer": data.get("revised_answer"),
    }

    # Default decision if missing
    if out["decision"] not in ("keep", "revise"):
        f = out["faithfulness"] or 5
        c = out["completeness"] or 5
        out["decision"] = "revise" if (f < faith_min or c < comp_min) else "keep"

    return out


def get_embed_db(embeddings):
    chroma_persist_dir = os.getenv("CHROMA_PERSIST_DIR")
    if chroma_persist_dir:
        db = get_chroma_db(embeddings, chroma_persist_dir)
    else:
        # You can add additional vector stores here
        raise EnvironmentError("No vector store environment variables found.")
    return db


def get_chroma_db(embeddings, persist_dir):
    db = Chroma(
        embedding_function=embeddings,
        collection_name=COLLECTION_NAME,
        persist_directory=persist_dir,
    )
    return db

if __name__ == "__main__":
    main()
