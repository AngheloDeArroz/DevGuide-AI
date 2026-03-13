from sentence_transformers import SentenceTransformer

# Load a pre-trained embedding model
# all-MiniLM-L6-v2 is fast and good for semantic search (384 dimensions)
model = SentenceTransformer('all-MiniLM-L6-v2')

def generate_embeddings(texts: list[str]) -> list[list[float]]:
    """Generates embeddings for a list of text chunks."""
    if not texts:
        return []
    
    # Generate embeddings as a list of lists (vectors)
    embeddings = model.encode(texts)
    return embeddings.tolist()

def generate_embedding(text: str) -> list[float]:
    """Generates an embedding for a single text string."""
    return generate_embeddings([text])[0]
