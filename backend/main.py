from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks, Depends
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import shutil
import os
import uuid
import subprocess
import pydantic
import stat
import logging
import traceback
import json
from sqlalchemy.orm import Session
from sqlalchemy import text
from pathlib import Path

from database import get_db, engine
from parser import extract_repository, parse_and_chunk
from embeddings import generate_embeddings
from retrieval import store_chunks, semantic_search
from llm import generate_explanation
from auth import get_current_user

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger(__name__)

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
async def upload_repo(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user)
):
    """Receives a ZIP file, extracts it, and creates a database record."""
    logger.info(f"[upload-repo] Received file: {file.filename} from user={user_id}")
    if not file.filename.endswith('.zip'):
        raise HTTPException(status_code=400, detail="Only ZIP files are supported.")
        
    repo_id = str(uuid.uuid4())
    zip_path = UPLOAD_DIR / f"{repo_id}.zip"
    extract_dir = UPLOAD_DIR / repo_id
    
    try:
        # Save ZIP file
        with open(zip_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        logger.info(f"[upload-repo] Saved ZIP to {zip_path}")
            
        # Extract
        extract_repository(str(zip_path), str(extract_dir))
        logger.info(f"[upload-repo] Extracted to {extract_dir}")
        
        # Create DB Record with user_id
        sql = text("INSERT INTO repositories (id, name, user_id) VALUES (:id, :name, :user_id) RETURNING id")
        db.execute(sql, {"id": repo_id, "name": file.filename, "user_id": user_id})
        db.commit()
        logger.info(f"[upload-repo] Created DB record for repo_id={repo_id}, user_id={user_id}")
        
        return {"message": f"Successfully extracted repository", "repo_id": repo_id, "repo_name": file.filename}
    except Exception as e:
        logger.error(f"[upload-repo] Error: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

class GithubRepoRequest(pydantic.BaseModel):
    url: str

@app.post("/upload-github-repo")
async def upload_github_repo(
    request: GithubRepoRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user)
):
    """Clones a GitHub repository and creates a database record."""
    logger.info(f"[upload-github-repo] Received URL: {request.url} from user={user_id}")
    if not request.url.startswith("https://github.com/"):
        raise HTTPException(status_code=400, detail="Only GitHub URLs are supported.")
        
    repo_id = str(uuid.uuid4())
    extract_dir = UPLOAD_DIR / repo_id
    
    # Clone repository
    try:
        logger.info(f"[upload-github-repo] Cloning {request.url}...")
        subprocess.run(["git", "clone", "--depth", "1", request.url, str(extract_dir)], check=True, capture_output=True, text=True)
        logger.info(f"[upload-github-repo] Clone complete to {extract_dir}")
    except subprocess.CalledProcessError as e:
        logger.error(f"[upload-github-repo] Git clone failed: {e.stderr}")
        raise HTTPException(status_code=400, detail=f"Failed to clone repository: {e.stderr}")
    except FileNotFoundError:
        logger.error("[upload-github-repo] 'git' is not installed or not in PATH")
        raise HTTPException(status_code=500, detail="Git is not installed on the server. Please install Git and try again.")
        
    # Remove .git directory to avoid indexing
    git_dir = extract_dir / ".git"
    if git_dir.exists():
        def remove_readonly(func, path, excinfo):
            os.chmod(path, stat.S_IWRITE)
            func(path)
        shutil.rmtree(git_dir, onerror=remove_readonly)
        logger.info(f"[upload-github-repo] Removed .git directory")
        
    # Create DB Record with user_id
    try:
        sql = text("INSERT INTO repositories (id, name, user_id) VALUES (:id, :name, :user_id) RETURNING id")
        repo_name = request.url.split("/")[-1]
        if repo_name.endswith('.git'):
            repo_name = repo_name[:-4]
        
        db.execute(sql, {"id": repo_id, "name": repo_name, "user_id": user_id})
        db.commit()
        logger.info(f"[upload-github-repo] Created DB record: repo_id={repo_id}, name={repo_name}, user_id={user_id}")
    except Exception as e:
        logger.error(f"[upload-github-repo] DB error: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    
    return {"message": "Successfully cloned repository", "repo_id": repo_id, "repo_name": repo_name}

@app.get("/repos")
async def list_repos(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user)
):
    """Returns a list of repositories belonging to the authenticated user."""
    logger.info(f"[repos] Listing repositories for user={user_id}")
    try:
        sql = text("SELECT id, name FROM repositories WHERE user_id = :user_id ORDER BY name")
        results = db.execute(sql, {"user_id": user_id}).fetchall()
        repos = [{"id": str(row.id), "name": row.name} for row in results]
        logger.info(f"[repos] Found {len(repos)} repositories for user={user_id}")
        return {"repos": repos}
    except Exception as e:
        logger.error(f"[repos] ❌ Error: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Failed to list repositories: {str(e)}")

@app.delete("/repos/{repo_id}")
async def delete_repo(
    repo_id: str,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user)
):
    """Deletes a repository owned by the authenticated user and all its code snippets."""
    logger.info(f"[delete-repo] Deleting repo_id={repo_id} for user={user_id}")
    try:
        # Delete code snippets first (foreign key)
        db.execute(text("DELETE FROM code_snippets WHERE repository_id = :repo_id"), {"repo_id": repo_id})
        # Delete the repository record — only if owned by user
        result = db.execute(
            text("DELETE FROM repositories WHERE id = :repo_id AND user_id = :user_id"),
            {"repo_id": repo_id, "user_id": user_id}
        )
        db.commit()
        
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Repository not found or you don't have permission to delete it.")
        
        # Clean up local files
        extract_dir = UPLOAD_DIR / repo_id
        if extract_dir.exists():
            shutil.rmtree(extract_dir, ignore_errors=True)
        zip_path = UPLOAD_DIR / f"{repo_id}.zip"
        if zip_path.exists():
            os.remove(zip_path)
            
        logger.info(f"[delete-repo] ✅ Deleted repo_id={repo_id}")
        return {"message": "Repository deleted successfully."}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[delete-repo] ❌ Error: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Failed to delete repository: {str(e)}")

def process_repository_task(repo_id: str, extract_dir: str):
    """Background task to index code."""
    db = next(get_db()) # Get DB session
    
    try:
        # 1. Parse and chunk
        logger.info(f"[index-{repo_id}] Parsing and chunking files...")
        chunks = parse_and_chunk(extract_dir)
        logger.info(f"[index-{repo_id}] Found {len(chunks)} chunks")
        
        if not chunks:
            logger.warning(f"[index-{repo_id}] No supported files found to index!")
            return
        
        # 2. Generate embeddings
        logger.info(f"[index-{repo_id}] Generating embeddings for {len(chunks)} chunks...")
        texts = [c["content"] for c in chunks]
        embeddings_list = generate_embeddings(texts)
        logger.info(f"[index-{repo_id}] Embeddings generated successfully")
        
        # 3. Store in DB
        logger.info(f"[index-{repo_id}] Storing embeddings in database...")
        for i, chunk in enumerate(chunks):
            chunk["embedding"] = embeddings_list[i]
            
        store_chunks(db, repo_id, chunks)
        logger.info(f"[index-{repo_id}] ✅ Indexing complete!")
        
    except Exception as e:
        logger.error(f"[index-{repo_id}] ❌ Error processing repository: {traceback.format_exc()}")
    finally:
        db.close()

@app.post("/index-code")
async def index_code(
    repo_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user)
):
    """Starts a background process to read files and generate embeddings."""
    # Verify the repo belongs to the user
    result = db.execute(
        text("SELECT id FROM repositories WHERE id = :repo_id AND user_id = :user_id"),
        {"repo_id": repo_id, "user_id": user_id}
    ).fetchone()
    if not result:
        raise HTTPException(status_code=404, detail="Repository not found or access denied.")

    extract_dir = UPLOAD_DIR / repo_id
    if not extract_dir.exists():
        raise HTTPException(status_code=404, detail="Repository files not found.")
        
    background_tasks.add_task(process_repository_task, repo_id, str(extract_dir))
    return {"message": f"Code indexing for {repo_id} started in the background."}

class AskRequest(pydantic.BaseModel):
    question: str
    repo_id: str

@app.post("/ask")
async def ask_question(
    request: AskRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user)
):
    """Accepts a user question, searches code, and returns an LLM explanation."""
    logger.info(f"[ask] Question: '{request.question}' | Repo: {request.repo_id} | User: {user_id}")
    
    # Verify the repo belongs to the user
    repo_check = db.execute(
        text("SELECT id FROM repositories WHERE id = :repo_id AND user_id = :user_id"),
        {"repo_id": request.repo_id, "user_id": user_id}
    ).fetchone()
    if not repo_check:
        raise HTTPException(status_code=404, detail="Repository not found or access denied.")

    try:
        logger.info(f"[ask] Running semantic search...")
        relevant_chunks = semantic_search(db, request.question, request.repo_id, limit=5)
        logger.info(f"[ask] Found {len(relevant_chunks)} relevant chunks")
        
        if not relevant_chunks:
            return {"answer": "No relevant code found in this repository for your question.", "context": []}
        
        logger.info(f"[ask] Sending to Gemini LLM...")
        answer = generate_explanation(request.question, relevant_chunks)
        logger.info(f"[ask] ✅ Got LLM response ({len(answer)} chars)")
        
        return {"answer": answer, "context": relevant_chunks}
    except Exception as e:
        logger.error(f"[ask] ❌ Error: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error processing question: {str(e)}")


# ─── Conversation endpoints ────────────────────────────────────────────────────

class ConversationCreateRequest(pydantic.BaseModel):
    repo_id: str
    title: str = "New Conversation"

@app.post("/conversations")
async def create_conversation(
    request: ConversationCreateRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user)
):
    """Creates a new conversation for the authenticated user and a given repo."""
    # Verify repo ownership
    repo_check = db.execute(
        text("SELECT id FROM repositories WHERE id = :repo_id AND user_id = :user_id"),
        {"repo_id": request.repo_id, "user_id": user_id}
    ).fetchone()
    if not repo_check:
        raise HTTPException(status_code=404, detail="Repository not found or access denied.")

    conv_id = str(uuid.uuid4())
    db.execute(
        text("INSERT INTO conversations (id, user_id, repository_id, title) VALUES (:id, :user_id, :repo_id, :title)"),
        {"id": conv_id, "user_id": user_id, "repo_id": request.repo_id, "title": request.title}
    )
    db.commit()
    logger.info(f"[conversations] Created conversation id={conv_id} for user={user_id}, repo={request.repo_id}")
    return {"id": conv_id, "title": request.title, "repo_id": request.repo_id}


@app.get("/conversations")
async def list_conversations(
    repo_id: str,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user)
):
    """Lists all conversations for the authenticated user in a given repo, newest first."""
    rows = db.execute(
        text("""
            SELECT id, title, created_at, updated_at
            FROM conversations
            WHERE user_id = :user_id AND repository_id = :repo_id
            ORDER BY updated_at DESC
        """),
        {"user_id": user_id, "repo_id": repo_id}
    ).fetchall()

    conversations = [
        {"id": str(r.id), "title": r.title, "created_at": r.created_at.isoformat(), "updated_at": r.updated_at.isoformat()}
        for r in rows
    ]
    return {"conversations": conversations}


@app.get("/conversations/{conversation_id}/messages")
async def get_messages(
    conversation_id: str,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user)
):
    """Returns all messages for a conversation, verifying ownership."""
    # Verify ownership via conversations table
    conv = db.execute(
        text("SELECT id FROM conversations WHERE id = :id AND user_id = :user_id"),
        {"id": conversation_id, "user_id": user_id}
    ).fetchone()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found or access denied.")

    rows = db.execute(
        text("SELECT id, role, content, context, created_at FROM messages WHERE conversation_id = :conv_id ORDER BY created_at ASC"),
        {"conv_id": conversation_id}
    ).fetchall()

    messages = [
        {"id": str(r.id), "role": r.role, "content": r.content, "context": r.context or [], "created_at": r.created_at.isoformat()}
        for r in rows
    ]
    return {"messages": messages}


class ConversationAskRequest(pydantic.BaseModel):
    question: str

@app.post("/conversations/{conversation_id}/ask")
async def ask_in_conversation(
    conversation_id: str,
    request: ConversationAskRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user)
):
    """Ask a question in a conversation. Saves user message + AI response to DB."""
    # Verify conversation ownership and get repo_id
    conv = db.execute(
        text("SELECT id, repository_id FROM conversations WHERE id = :id AND user_id = :user_id"),
        {"id": conversation_id, "user_id": user_id}
    ).fetchone()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found or access denied.")

    repo_id = str(conv.repository_id)
    logger.info(f"[conv-ask] conv={conversation_id} | question='{request.question}' | user={user_id}")

    try:
        # 1. Semantic search
        relevant_chunks = semantic_search(db, request.question, repo_id, limit=5)

        if not relevant_chunks:
            answer = "No relevant code found in this repository for your question."
            relevant_chunks = []
        else:
            # 2. LLM
            answer = generate_explanation(request.question, relevant_chunks)

        # 3. Save user message
        db.execute(
            text("INSERT INTO messages (id, conversation_id, role, content) VALUES (:id, :conv_id, 'user', :content)"),
            {"id": str(uuid.uuid4()), "conv_id": conversation_id, "content": request.question}
        )

        # 4. Save assistant message (with retrieved context)
        db.execute(
            text("INSERT INTO messages (id, conversation_id, role, content, context) VALUES (:id, :conv_id, 'assistant', :content, :context)"),
            {"id": str(uuid.uuid4()), "conv_id": conversation_id, "content": answer, "context": json.dumps(relevant_chunks)}
        )

        # 5. Update conversation updated_at and auto-title from first question
        msg_count = db.execute(
            text("SELECT COUNT(*) FROM messages WHERE conversation_id = :conv_id"),
            {"conv_id": conversation_id}
        ).scalar()

        if msg_count <= 2:  # just inserted the first pair
            short_title = request.question[:60] + ("…" if len(request.question) > 60 else "")
            db.execute(
                text("UPDATE conversations SET title = :title, updated_at = now() WHERE id = :id"),
                {"title": short_title, "id": conversation_id}
            )
        else:
            db.execute(
                text("UPDATE conversations SET updated_at = now() WHERE id = :id"),
                {"id": conversation_id}
            )

        db.commit()
        logger.info(f"[conv-ask] ✅ Saved Q&A pair to conversation={conversation_id}")

        return {"answer": answer, "context": relevant_chunks}

    except Exception as e:
        logger.error(f"[conv-ask] ❌ Error: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error processing question: {str(e)}")


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
