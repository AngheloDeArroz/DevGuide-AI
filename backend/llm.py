import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

# Configure Gemini API
API_KEY = os.getenv("GEMINI_API_KEY")
if not API_KEY:
    print("Warning: GEMINI_API_KEY not found in environment variables.")
else:
    genai.configure(api_key=API_KEY)

model = genai.GenerativeModel('gemini-2.5-flash')

def generate_explanation(question: str, context_chunks: list[dict]) -> str:
    """Uses Gemini API to answer a user question based on the provided code context."""
    
    # Construct the RAG prompt
    prompt = f"You are a helpful expert software engineer. Your task is to explain a codebase to a user based on their question.\n\n"
    prompt += f"USER QUESTION: {question}\n\n"
    prompt += f"Here is the relevant code from the repository to help you answer the question:\n\n"
    
    for i, chunk in enumerate(context_chunks):
        prompt += f"--- Snippet {i+1} from {chunk['file_path']} ---\n"
        prompt += f"{chunk['content']}\n"
        prompt += f"-------------------------\n\n"
        
    prompt += "INSTRUCTIONS:\n"
    prompt += "1. Answer the user's question clearly and concisely.\n"
    prompt += "2. Reference the specific file paths and code snippets provided above.\n"
    prompt += "3. If the answer is not contained in the provided context, state that clearly.\n"
    prompt += "4. Use markdown formatting for readability (e.g., code blocks for inline code)."
    
    try:
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        print(f"Error generating explanation from Gemini: {e}")
        return "Sorry, I encountered an error while trying to generate the explanation."
