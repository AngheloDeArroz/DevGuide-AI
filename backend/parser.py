import os
import zipfile
import shutil
from pathlib import Path

# Common extensions to parse
SUPPORTED_EXTENSIONS = {'.py', '.js', '.ts', '.php', '.java', '.cpp'}
# Directories to ignore
IGNORED_DIRS = {'node_modules', 'vendor', '.git', '__pycache__', 'dist', 'build', 'venv', '.env'}

def extract_repository(zip_path: str, extract_to: str) -> str:
    """Extracts a ZIP file to a specified directory."""
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(extract_to)
    return extract_to

def get_files_to_index(repo_path: str) -> list[str]:
    """Scans the repository and returns a list of file paths to index."""
    files_to_index = []
    
    for root, dirs, files in os.walk(repo_path):
        # Modify dirs in-place to ignore specified directories
        dirs[:] = [d for d in dirs if d not in IGNORED_DIRS]
        
        for file in files:
            file_path = Path(root) / file
            if file_path.suffix in SUPPORTED_EXTENSIONS:
                files_to_index.append(str(file_path))
                
    return files_to_index

def chunk_file_content(content: str, max_chunk_size: int = 1000, overlap: int = 200) -> list[str]:
    """Splits a string into overlapping chunks."""
    # This is a very basic chunking strategy.
    # Advanced: Use an AST parser (like tree-sitter) to chunk by functions/classes.
    chunks = []
    start = 0
    content_length = len(content)
    
    while start < content_length:
        end = start + max_chunk_size
        chunks.append(content[start:end])
        start += max_chunk_size - overlap
        
    return chunks

def parse_and_chunk(repo_path: str) -> list[dict]:
    """Parses all supported files in a repo and returns chunks."""
    files = get_files_to_index(repo_path)
    all_chunks = []
    
    for file_path in files:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                
            # Basic text chunking
            chunks = chunk_file_content(content)
            
            # Save metadata
            for i, chunk in enumerate(chunks):
                all_chunks.append({
                    "file_path": str(Path(file_path).relative_to(repo_path)),
                    "content": chunk,
                    "chunk_index": i
                })
        except Exception as e:
            print(f"Error reading file {file_path}: {e}")
            
    return all_chunks
