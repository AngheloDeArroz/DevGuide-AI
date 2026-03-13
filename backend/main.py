from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks, Depends
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import shutil
import os
import uuid
from sqlalchemy.orm import Session
from sqlalchemy import text
from pathlib import Path

from database import get_db, engine
from parser import extract_repository, parse_and_chunk
from embeddings import generate_embeddings
from retrieval import store_chunks, semantic_search
from llm import generate_explanation

app = FastAPI(title="DevGuide AI", version="0.1.0")

# Setup CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, replace with specific frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)


@app.get("/")
async def root():
    return {"message": "Welcome to DevGuide AI API"}

@app.post("/upload-repo")
async def upload_repo(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Receives a ZIP file, extracts it, and creates a database record."""
    if not file.filename.endswith('.zip'):
        raise HTTPException(status_code=400, detail="Only ZIP files are supported.")
        
    repo_id = str(uuid.uuid4())
    zip_path = UPLOAD_DIR / f"{repo_id}.zip"
    extract_dir = UPLOAD_DIR / repo_id
    
    # Save ZIP file
    with open(zip_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Extract
    extract_repository(str(zip_path), str(extract_dir))
    
    # Optional: Delete ZIP after extraction
    # os.remove(zip_path)
    
    # Create DB Record
    sql = text("INSERT INTO repositories (id, name) VALUES (:id, :name) RETURNING id")
    db.execute(sql, {"id": repo_id, "name": file.filename})
    db.commit()
    
    return {"message": f"Successfully extracted repository", "repo_id": repo_id}

def process_repository_task(repo_id: str, extract_dir: str):
    """Background task to index code."""
    db = next(get_db()) # Get DB session
    
    try:
        # 1. Parse and chunk
        print(f"[{repo_id}] Parsing and chunking files...")
        chunks = parse_and_chunk(extract_dir)
        
        # 2. Generate embeddings
        print(f"[{repo_id}] Generating embeddings for {len(chunks)} chunks...")
        texts = [c["content"] for c in chunks]
        embeddings_list = generate_embeddings(texts)
        
        # 3. Store in DB
        print(f"[{repo_id}] Storing embeddings in database...")
        for i, chunk in enumerate(chunks):
            chunk["embedding"] = embeddings_list[i]
            
        store_chunks(db, repo_id, chunks)
        print(f"[{repo_id}] Indexing complete!")
        
    except Exception as e:
        print(f"[{repo_id}] Error processing repository: {e}")
    finally:
        db.close()

@app.post("/index-code")
async def index_code(repo_id: str, background_tasks: BackgroundTasks):
    """Starts a background process to read files and generate embeddings."""
    extract_dir = UPLOAD_DIR / repo_id
    if not extract_dir.exists():
        raise HTTPException(status_code=404, detail="Repository not found.")
        
    background_tasks.add_task(process_repository_task, repo_id, str(extract_dir))
    return {"message": f"Code indexing for {repo_id} started in the background."}

import pydantic

class AskRequest(pydantic.BaseModel):
    question: str
    repo_id: str

@app.post("/ask")
async def ask_question(request: AskRequest, db: Session = Depends(get_db)):
    """Accepts a user question, searches code, and returns an LLM explanation."""
    
    # 1. Semantic Search
    relevant_chunks = semantic_search(db, request.question, request.repo_id, limit=5)
    
    if not relevant_chunks:
        return {"answer": "No relevant code found in this repository for your question.", "context": []}
    
    # 2. Ask LLM
    answer = generate_explanation(request.question, relevant_chunks)
    
    return {"answer": answer, "context": relevant_chunks}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
