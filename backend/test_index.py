import os

from pathlib import Path
from database import SessionLocal
from parser import parse_and_chunk
from embeddings import generate_embeddings
from retrieval import store_chunks

def test_indexing():
    # Use the first uploaded repo as a test
    upload_dir = Path("uploads")
    repos = [d for d in upload_dir.iterdir() if d.is_dir()]
    if not repos:
        print("No extracted repo found.")
        return
        
    repo_dir = repos[0]
    repo_id = repo_dir.name
    print(f"Testing with repo_id: {repo_id}")
    
    db = SessionLocal()
    try:
        print("Parsing and chunking...")
        chunks = parse_and_chunk(str(repo_dir))
        print(f"Found {len(chunks)} chunks. Here is the first: {chunks[0] if chunks else 'None'}")
        
        if not chunks:
            return
            
        print("Generating embeddings...")
        texts = [c["content"] for c in chunks[:2]] # Test on 2
        embeddings_list = generate_embeddings(texts)
        
        print("Storing in DB...")
        for i, chunk in enumerate(chunks[:2]):
            chunk["embedding"] = embeddings_list[i]
            
        store_chunks(db, repo_id, chunks[:2])
        print("Success!")
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    test_indexing()
