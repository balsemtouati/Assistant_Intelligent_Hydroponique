# projet_ihm

Monorepo frontend + backend RAG (FastAPI).

## Structure
- `frontend/`: UI statique (dashboard + chatbot `chat.html`)
- `rag-example-main/`: Backend RAG (FastAPI `api.py`, indexation, scripts)
- `.venv/`: Environnement Python local (non versionné)

## Prérequis
- Python 3.10+
- Clé Google Generative AI (Gemini): set `GOOGLE_API_KEY` dans `rag-example-main/.env`

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
3. Inviter votre collègue comme collaborateur sur GitHub (Settings → Collaborators) ou utilisez des Pull Requests.

## Notes
- Santé API: http://127.0.0.1:8001/health (répond {"status":"ok"}).
- Le frontend `chat.html` est configuré pour cibler `http://127.0.0.1:8001` via `window.HC_API_BASE`.
- Restreignez CORS en prod (voir `rag-example-main/api.py`).
- Ne versionnez pas vos clés `.env` (utilisez `.env.default` pour un exemple si besoin).

## Démarrage rapide (script)
Vous pouvez lancer API (8001) et frontend (5500) en deux consoles PowerShell via:

```powershell
powershell -ExecutionPolicy Bypass -File .\start_dev.ps1
```

Si un port est occupé:

```powershell
netstat -ano | findstr :8001
taskkill /PID <PID> /F
```
