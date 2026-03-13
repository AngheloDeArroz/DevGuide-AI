import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()
db_url = os.getenv("SUPABASE_DB_URL")
if not db_url:
    print("No DB URL")
    exit(1)

engine = create_engine(db_url)
with engine.connect() as conn:
    # Check if table exists
    result = conn.execute(text("SELECT count(*) FROM repositories")).scalar()
    print(f"Total Repositories: {result}")
    
    result = conn.execute(text("SELECT count(*) FROM code_snippets")).scalar()
    print(f"Total Code Snippets: {result}")
    
    if result > 0:
        sample = conn.execute(text("SELECT repository_id, file_path, length(content_embedding::text) as emb_len FROM code_snippets LIMIT 1")).fetchone()
        print(f"Sample Snippet: repo={sample[0]}, file={sample[1]}, embedding_length={sample[2]}")
