# Projet Assistant Intelligent pour l’Agriculture Hydroponique 
# Retrieval-Augmented Generation (RAG) Example

This repository contains code for demonstrating retrieval-augmented
generation (RAG), a mechanism for incorporating domain-specific
content into generative AI interactions with large language models
(LLMs).
Monorepo frontend + backend RAG (FastAPI).

## Structure
- `frontend/`: UI statique (dashboard + chatbot `chat.html`)
- `rag-example-main/`: Backend RAG (FastAPI `api.py`, indexation, scripts)
- `.venv/`: Environnement Python local (non versionné)

## Prérequis
- Python 3.10+
- Clé Google Generative AI (Gemini): set `GOOGLE_API_KEY` dans `rag-example-main/.env`
## Code Listing

- `index_documents.py` — Indexe les documents sources (PDF) : convertit
  les PDFs en texte, découpe en segments adaptés au modèle d'embed,
  génère des embeddings (`all-MiniLM-L6-v2`) et persiste l'index via
  Chroma pour la recherche sémantique.

- `document_chatbot.py` — Exemple de pipeline RAG complet : charge
  l'index persistant, construit un `retriever` (option MMR), crée la
  chaîne conversationnelle avec mémoire tampon, interroge le LLM
  (Google Gemini si configuré) et effectue une évaluation/raffinement
  (judge) pour vérifier la fidélité et la complétude par rapport aux
  documents sources.

- `api.py` — API FastAPI exposant le chatbot RAG : initialise les
  composants (embeddings, retriever, LLM, juge) au démarrage,
  gère les sessions utilisateur et fournit l'endpoint `/api/chat`
  (retourne la réponse, pages sources et métriques d'évaluation),
  ainsi que `/health`.

Note sur les sources (web scraping)

- Les documents utilisés pour l'indexation ont été collectés par web
  scraping sous le dossier data_collection. Le fichier PDF
  combiné des sources est disponible localement à :

 rag-example-main\source_documents\combined_rag.pdf



## Installation rapide
```powershell
# Cloner le repo
# git clone <url>
# cd ihm

# (optionnel) Créer/activer un venv
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# Installer backend deps
pip install -r .\rag-example-main\requirements.txt

# Indexer les documents (si nécessaire)
python .\rag-example-main\index_documents.py

# Lancer l'API (port 8001)
cd .\rag-example-main
uvicorn api:app --host 127.0.0.1 --port 8001
```

Dans un autre terminal, servir le frontend:
```powershell
cd .\frontend
python -m http.server 5500
```

Ouvrir: http://127.0.0.1:5500/dashboard.html puis cliquez "Chatbot".

## Partager sur GitHub
1. Créer un repo sur GitHub (vide, sans README si vous poussez celui-ci).
2. Dans ce dossier (`ihm/`), initialiser git et pousser:
```powershell
git init
git add .
git commit -m "Initial commit"
# Remplacez <url> par l'URL de votre repo GitHub (SSH ou HTTPS)
git remote add origin <url>
git branch -M main
git push -u origin main
```

## Notes

## Démarrage rapide (script)
Vous pouvez lancer API (8001) et frontend (5500) en deux consoles PowerShell via:

```powershell
powershell -ExecutionPolicy Bypass -File .\start_dev.ps1
```

## Pipeline RAG

Le pipeline RAG (Retrieval-Augmented Generation) utilisé dans ce
projet suit plusieurs étapes clés, de l'ingestion des documents à la
génération et l'évaluation des réponses par un LLM. Les étapes sont :

- **Ingestion & ETL** : chargement des PDF (`PyPDFLoader`), nettoyage
  léger et découpage en segments via un `RecursiveCharacterTextSplitter`.
- **Indexing & Vectorization** : génération d'embeddings (ex. :
  `all-MiniLM-L6-v2`) et stockage persistant dans une base vectorielle
  (Chroma) sous la collection `doc_index`.
- **Advanced Retrieval** : utilisation d'un retriever (option MMR)
  pour récupérer des passages diversifiés et pertinents parmi les
  chunks indexés.
- **Generation & Control** : construction de prompts contextualisés et
  invocation du LLM (Google Gemini dans ce dépôt) pour produire la
  réponse finale en s'appuyant sur les documents récupérés.
- **Evaluation & Refinement (LLM-as-a-Judge)** : une instance LLM
  dédiée évalue la fidélité et la complétude de la réponse par rapport
  au contexte, et peut proposer une version révisée si nécessaire.

l'image illustrant ce flux est la suivante
`rag-example-main/images/rag_data_flow_image.png`

## Captures d'écran / Images de la plateforme

- Dossier d'images : [rag-example-main/images](projet_ihm-main\projet_ihm-main\hydroponie)

Pour afficher les images localement, ouvrez le dossier `rag-example-main/images` dans l'explorateur ou servez le frontend et naviguez vers la page correspondante.

