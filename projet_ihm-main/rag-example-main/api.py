from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
import uvicorn
import os
import json
from typing import Dict, Any
import uuid

# Importez votre code RAG existant
from document_chatbot import (
    get_embed_db,
    HuggingFaceEmbeddings,
    ChatGoogleGenerativeAI,
    judge_and_refine as judge_and_refine_dc,
)

app = FastAPI(title="HydroCare Chatbot API")

# CORS pour permettre les requêtes depuis le frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5500", "http://localhost:5500", "http://127.0.0.1:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Modèles Pydantic pour la validation
class ChatRequest(BaseModel):
    question: str
    session_id: str = None

class ChatResponse(BaseModel):
    answer: str
    sources: list
    session_id: str
    faithfulness: int = None
    completeness: int = None
    decision: str = None

# Initialisation globale des composants RAG
embeddings = None
retriever = None
llm = None
llm_judge = None
sessions = {}

def initialize_rag_components():
    """Initialise les composants RAG une seule fois au démarrage"""
    global embeddings, retriever, llm, llm_judge
    
    print("Initialisation des composants RAG...")
    
    # Embeddings
    embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
    db = get_embed_db(embeddings)
    retriever = db.as_retriever(search_type="mmr", search_kwargs={"k": 6, "fetch_k": 20, "lambda_mult": 0.7})
    
    # LLM
    gemini_api_key = os.getenv("GOOGLE_API_KEY")
    gemini_model_name = os.getenv("GEMINI_MODEL_NAME", "gemini-2.5-flash")
    
    llm = ChatGoogleGenerativeAI(
        model=gemini_model_name,
        google_api_key=gemini_api_key,
        temperature=0.5,
        verbose=False
    )
    
    llm_judge = ChatGoogleGenerativeAI(
        model=gemini_model_name,
        google_api_key=gemini_api_key,
        temperature=0.1,
        verbose=False
    )
    
    print("Composants RAG initialisés avec succès")

@app.on_event("startup")
async def startup_event():
    initialize_rag_components()

def build_prompt(question: str, context: str) -> str:
    """Construit le prompt pour le LLM"""
    return (
        "Vous êtes un assistant expert et fiable. Répondez en français, de manière claire, précise et utile,"
        " en vous appuyant uniquement sur le CONTEXTE fourni. Si une information n'est pas présente dans le contexte,"
        " dites-le explicitement et évitez toute spéculation.\n\n"
        f"Question: {question}\n\n"
        "Consignes:\n"
        "- Répondez directement à la question en 1–3 paragraphes maximum, ou en liste à puces si c'est plus clair.\n"
        "- Utilisez les informations du contexte pour donner des détails concrets (définitions, étapes, paramètres, chiffres, exemples, formules) si disponibles.\n"
        "- Si le contexte est insuffisant: indiquez précisément ce qui manque et proposez 1–2 pistes de recherche ou questions de clarification, sans inventer.\n"
        "- Évitez les généralités, répétitions et remplissage; privilégiez des phrases courtes et des listes.\n\n"
        f"Contexte:\n{context}\n\n"
        "Réponse:"
    )

def build_context_snippet(sources, max_chars=4000):
    """Construit le contexte à partir des sources"""
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
        snippet = text[:800]
        parts.append(f"{header} {snippet}")
        joined = "\n\n".join(parts)
        if len(joined) >= max_chars:
            break
    return "\n\n".join(parts)[:max_chars]

def judge_and_refine(llm_judge, question, answer, context, faith_min=4, comp_min=4):
    """Délègue à la fonction judge_and_refine du module document_chatbot."""
    return judge_and_refine_dc(
        llm_judge=llm_judge,
        question=question,
        answer=answer,
        context=context,
        faith_min=faith_min,
        comp_min=comp_min,
    )

@app.post("/api/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    """Endpoint pour le chat"""
    try:
        # Gestion des sessions
        if not request.session_id or request.session_id not in sessions:
            session_id = str(uuid.uuid4())
            sessions[session_id] = {"asked_counts": {}}
        else:
            session_id = request.session_id
        
        session = sessions[session_id]
        
        # Récupération du contexte
        docs = retriever.invoke(request.question)
        context_snippet = build_context_snippet(docs, 4000)
        
        # Gestion des répétitions
        key = " ".join((request.question or "").split()).lower()
        count = session["asked_counts"].get(key, 0)
        final_question = request.question
        
        if count > 0:
            final_question = (
                f"{request.question}\n\n"
                "Instruction de style: c'est une répétition de la même question. "
                "Reformule la réponse (style et tournure) mais conserve STRICTEMENT toutes les informations, "
                "faits, valeurs numériques et citations de pages extraits du contexte. Ne retire aucun détail, "
                "n'ajoute rien, ne modifie aucune valeur; change uniquement la formulation."
            )
        
        session["asked_counts"][key] = count + 1
        
        # Génération de la réponse
        prompt_text = build_prompt(final_question, context_snippet)
        llm_resp = llm.invoke(prompt_text)
        answer = getattr(llm_resp, "content", str(llm_resp)) or ""
        
        # Extraction des sources
        unique_pages = []
        for doc in docs:
            page = doc.metadata.get("page_label") or doc.metadata.get("page")
            if page is not None and page not in unique_pages:
                unique_pages.append(page)
        
        # Jugement et raffinement
        faithfulness = None
        completeness = None
        decision = None
        
        if True:  # ENABLE_JUDGE
            try:
                judge_out = judge_and_refine(
                    llm_judge=llm_judge,
                    question=request.question,
                    answer=answer,
                    context=context_snippet,
                    faith_min=4,
                    comp_min=4,
                )
                if judge_out and judge_out.get("decision") == "revise" and judge_out.get("revised_answer"):
                    answer = judge_out["revised_answer"].strip()
                
                faithfulness = judge_out.get("faithfulness")
                completeness = judge_out.get("completeness")
                decision = judge_out.get("decision")
            except Exception as e:
                print(f"Erreur lors du jugement: {e}")
        
        return ChatResponse(
            answer=answer,
            sources=unique_pages,
            session_id=session_id,
            faithfulness=faithfulness,
            completeness=completeness,
            decision=decision
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur interne: {str(e)}")

@app.post("/api/reset-session")
async def reset_session(session_id: str):
    """Réinitialise une session"""
    if session_id in sessions:
        del sessions[session_id]
    return {"message": "Session réinitialisée"}

@app.get("/")
async def root():
    return {"message": "HydroCare API is running"}

@app.get("/health")
async def health():
    return {"status": "ok"}

if __name__ == "__main__":
    uvicorn.run("api:app", host="127.0.0.1", port=8000, reload=True)