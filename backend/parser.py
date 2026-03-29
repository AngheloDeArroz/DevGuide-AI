"""
Code parsing & chunking for DevGuide AI.

Optimizations over the original implementation:
 - AST-based chunking via tree-sitter (function / class level)
 - SHA-256 file hashing to detect unchanged content
 - Binary file detection (skip files with null bytes)
 - Max file size limit (1 MB)
 - Max chunks-per-file and total-chunks caps
 - Whitespace normalisation before embedding
 - Falls back to fixed-size chunking only for unsupported languages
"""

import os
import re
import zipfile
import hashlib
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Tree-sitter setup (lazy-loaded per language)
# ---------------------------------------------------------------------------

try:
    from tree_sitter import Language, Parser as TSParser
    import tree_sitter_python
    import tree_sitter_javascript
    import tree_sitter_typescript
    import tree_sitter_php
    import tree_sitter_java
    import tree_sitter_cpp

    _TS_LANGUAGES: dict[str, Language] = {}

    def _get_ts_language(ext: str) -> Language | None:
        """Return the tree-sitter Language for a file extension, or None."""
        mapping = {
            ".py": ("python", tree_sitter_python),
            ".js": ("javascript", tree_sitter_javascript),
            ".ts": ("typescript", tree_sitter_typescript),
            ".php": ("php", tree_sitter_php),
            ".java": ("java", tree_sitter_java),
            ".cpp": ("cpp", tree_sitter_cpp),
            ".cc": ("cpp", tree_sitter_cpp),
            ".cxx": ("cpp", tree_sitter_cpp),
            ".h": ("cpp", tree_sitter_cpp),
            ".hpp": ("cpp", tree_sitter_cpp),
        }
        info = mapping.get(ext)
        if info is None:
            return None
        name, mod = info
        if name not in _TS_LANGUAGES:
            try:
                _TS_LANGUAGES[name] = Language(mod.language())
            except Exception as e:
                logger.warning(f"[parser] Failed to load tree-sitter language '{name}': {e}")
                return None
        return _TS_LANGUAGES[name]

    TREE_SITTER_AVAILABLE = True
except ImportError:
    logger.warning("[parser] tree-sitter not available — falling back to fixed-size chunking")
    TREE_SITTER_AVAILABLE = False

    def _get_ts_language(ext: str):
        return None

# ---------------------------------------------------------------------------
# Constants & config
# ---------------------------------------------------------------------------

SUPPORTED_EXTENSIONS = {".py", ".js", ".ts", ".php", ".java", ".cpp", ".cc", ".cxx", ".h", ".hpp"}

IGNORED_DIRS = {
    "node_modules", "vendor", ".git", "__pycache__", "dist", "build",
    "venv", ".env", ".venv", "env", ".tox", ".mypy_cache", ".pytest_cache",
    "site-packages", "egg-info",
}

MAX_FILE_SIZE = 1 * 1024 * 1024       # 1 MB
MAX_CHUNKS_PER_FILE = 50
MAX_TOTAL_CHUNKS = 2000

# Node types we consider "meaningful" in each AST
_FUNCTION_CLASS_NODES = {
    "function_definition", "class_definition",         # Python
    "function_declaration", "class_declaration",       # JS / TS / Java
    "method_definition", "arrow_function",             # JS / TS
    "method_declaration", "constructor_declaration",   # Java
    "function_definition", "class_specifier",          # C++
    "function_declaration",                            # PHP
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def compute_file_hash(content: str) -> str:
    """SHA-256 hash of the file content, used for change-detection."""
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def is_binary_file(path: str) -> bool:
    """Read first 8 KB and check for null bytes."""
    try:
        with open(path, "rb") as f:
            chunk = f.read(8192)
            return b"\x00" in chunk
    except Exception:
        return True


def normalize_whitespace(text: str) -> str:
    """Collapse excessive blank lines & trailing whitespace for embedding."""
    # Remove trailing whitespace per line
    text = re.sub(r"[ \t]+$", "", text, flags=re.MULTILINE)
    # Collapse 3+ consecutive blank lines into 2
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


# ---------------------------------------------------------------------------
# Extraction
# ---------------------------------------------------------------------------

def extract_repository(zip_path: str, extract_to: str) -> str:
    """Extracts a ZIP file to a specified directory."""
    with zipfile.ZipFile(zip_path, "r") as zip_ref:
        zip_ref.extractall(extract_to)
    return extract_to


# ---------------------------------------------------------------------------
# File discovery
# ---------------------------------------------------------------------------

def get_files_to_index(repo_path: str) -> list[str]:
    """Scans the repository and returns paths of indexable source files."""
    files_to_index = []

    for root, dirs, files in os.walk(repo_path):
        dirs[:] = [d for d in dirs if d not in IGNORED_DIRS]

        for file in files:
            file_path = Path(root) / file
            if file_path.suffix not in SUPPORTED_EXTENSIONS:
                continue
            # Size guard
            try:
                if file_path.stat().st_size > MAX_FILE_SIZE:
                    logger.info(f"[parser] Skipping oversized file ({file_path.stat().st_size} bytes): {file_path}")
                    continue
            except OSError:
                continue
            files_to_index.append(str(file_path))

    return files_to_index


# ---------------------------------------------------------------------------
# AST-based chunking
# ---------------------------------------------------------------------------

def _ast_chunk(content: str, ext: str) -> list[str] | None:
    """Attempt to chunk *content* by AST nodes. Returns None on failure."""
    lang = _get_ts_language(ext)
    if lang is None:
        return None

    try:
        parser = TSParser(lang)
        tree = parser.parse(bytes(content, "utf-8"))
    except Exception as e:
        logger.warning(f"[parser] tree-sitter parse failed for ext={ext}: {e}")
        return None

    chunks: list[str] = []
    root = tree.root_node

    def _walk(node):
        if node.type in _FUNCTION_CLASS_NODES:
            snippet = content[node.start_byte:node.end_byte]
            if snippet.strip():
                chunks.append(snippet)
            return  # don't recurse into nested — we take the whole node
        for child in node.children:
            _walk(child)

    _walk(root)

    # If the AST produced nothing useful, return None so we fall back
    if not chunks:
        return None

    # Capture any top-level code not inside a function/class (imports, constants, etc.)
    covered = set()
    def _mark(node):
        if node.type in _FUNCTION_CLASS_NODES:
            for b in range(node.start_byte, node.end_byte):
                covered.add(b)
            return
        for child in node.children:
            _mark(child)
    _mark(root)

    top_level_lines: list[str] = []
    for i, byte in enumerate(content.encode("utf-8")):
        pass  # We'll do this line-wise instead

    # Simpler: collect lines not covered by any AST chunk
    lines = content.split("\n")
    byte_offset = 0
    uncovered_lines: list[str] = []
    for line in lines:
        line_bytes = len(line.encode("utf-8")) + 1  # +1 for newline
        line_start = byte_offset
        line_end = byte_offset + line_bytes
        # Check if any byte in this line is NOT covered
        if not any(b in covered for b in range(line_start, min(line_end, line_start + 1))):
            if line.strip():
                uncovered_lines.append(line)
        byte_offset = line_end

    if uncovered_lines:
        top_block = "\n".join(uncovered_lines)
        if len(top_block.strip()) > 20:  # Only if meaningful
            chunks.insert(0, top_block)

    return chunks


# ---------------------------------------------------------------------------
# Fixed-size fallback chunking
# ---------------------------------------------------------------------------

def chunk_file_content(content: str, max_chunk_size: int = 1000, overlap: int = 200) -> list[str]:
    """Splits a string into overlapping chunks (fallback when AST is unavailable)."""
    chunks = []
    start = 0
    content_length = len(content)

    while start < content_length:
        end = start + max_chunk_size
        chunks.append(content[start:end])
        start += max_chunk_size - overlap

    return chunks


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def parse_and_chunk(repo_path: str) -> list[dict]:
    """
    Parse all supported files in a repo and return chunks.

    Each chunk dict contains:
      - file_path:    relative path within repo
      - content:      the chunk text
      - content_normalized: whitespace-cleaned text for embedding
      - chunk_index:  index within the file
      - file_hash:    SHA-256 of the original file content
    """
    files = get_files_to_index(repo_path)
    all_chunks: list[dict] = []

    for file_path in files:
        if len(all_chunks) >= MAX_TOTAL_CHUNKS:
            logger.warning(f"[parser] Reached MAX_TOTAL_CHUNKS ({MAX_TOTAL_CHUNKS}), stopping.")
            break

        # Binary check
        if is_binary_file(file_path):
            logger.info(f"[parser] Skipping binary file: {file_path}")
            continue

        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
        except Exception as e:
            logger.warning(f"[parser] Error reading {file_path}: {e}")
            continue

        if not content.strip():
            continue

        file_hash = compute_file_hash(content)
        rel_path = str(Path(file_path).relative_to(repo_path))
        ext = Path(file_path).suffix.lower()

        # Try AST-based chunking first
        raw_chunks = _ast_chunk(content, ext)
        if raw_chunks is None:
            raw_chunks = chunk_file_content(content)

        # Cap per-file
        raw_chunks = raw_chunks[:MAX_CHUNKS_PER_FILE]

        for i, chunk_text in enumerate(raw_chunks):
            if len(all_chunks) >= MAX_TOTAL_CHUNKS:
                break
            normalized = normalize_whitespace(chunk_text)
            if not normalized:
                continue
            all_chunks.append({
                "file_path": rel_path,
                "content": chunk_text,
                "content_normalized": normalized,
                "chunk_index": i,
                "file_hash": file_hash,
            })

    logger.info(f"[parser] Produced {len(all_chunks)} chunks from {len(files)} files")
    return all_chunks
