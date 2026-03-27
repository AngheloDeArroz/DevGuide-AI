# DevGuide AI

DevGuide AI is an AI-powered code analysis tool that allows users to upload GitHub repository via link or ZIP files, parses their contents, and enables conversational Q&A to help understand the codebase using RAG (Retrieval-Augmented Generation). 

## Features
- **Upload & parse:** Upload any ZIP file containing a codebase.
- **Intelligent RAG:** The repository is parsed, chunked, embedded using sentence-transformers, and stored in a PostgreSQL database with `pgvector`.
- **Ask questions:** Use Google's Gemini to ask natural-language questions about the code, backed by semantic retrieval.
- **Modern UI:** A clean, responsive React frontend.

## Tech Stack
### Backend
- **FastAPI:** Core backend framework.
- **SQLAlchemy & pgvector:** Database ORM and vector similarity search.
- **HuggingFace Sentence-Transformers:** Used locally to generate embeddings (`all-MiniLM-L6-v2`).
- **Google Generative AI (Gemini):** Used as the LLM for synthesizing answers.

### Frontend
- **React (Vite):** Core library and build tool.
- **Tailwind CSS:** For styling and UI.
- **Axios:** API requests.
- **Lucide React:** Icons.

---

## Prerequisites
Before you begin, ensure you have the following installed:
- Python 3.8+
- Node.js & npm
- PostgreSQL database with the [`pgvector`](https://github.com/pgvector/pgvector) extension enabled.

---

## 🐳 Running with Docker (Recommended)

The easiest way to run the project. No Python or Node.js installation required — just [Docker](https://www.docker.com/products/docker-desktop/).

**1. Set up environment variables:**
```bash
# Backend — Supabase DB connection + Gemini API key
cp backend/.env.example backend/.env

# Frontend — Supabase project URL and anon key
cp frontend/.env.example frontend/.env
```
Edit both `.env` files and fill in your credentials.

**2. Build and start all services:**
```bash
docker compose up --build
```

**3. Open the app:**  
Navigate to **http://localhost:5173** in your browser.

To stop: `docker compose down`

> **Note:** Uploaded repositories are stored in a Docker volume (`backend_uploads`) and persist across restarts.

---

## How to Run (Manual Setup)

To run the application locally, you will need to start both the backend server and the frontend development server in two separate terminal windows.

### 1. Backend Setup
1. **Navigate to the backend directory:**
   ```bash
   cd backend
   ```

2. **Create and activate a virtual environment:**
   ```bash
   python -m venv venv
   
   # Windows:
   .\venv\Scripts\activate
   # macOS/Linux:
   source venv/bin/activate
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Set up Environment Variables:**
   Create a `.env` file in the `backend` folder based on `.env.example`:
   ```env
   SUPABASE_DB_URL=postgresql://user:password@host:port/dbname
   GEMINI_API_KEY=your_gemini_api_key
   ```
   > **Note:** Make sure your PostgreSQL database has the `pgvector` extension enabled (`CREATE EXTENSION IF NOT EXISTS vector;`). 
   > You also need a `repositories` and `code_snippets` table set up.

5. **Start the server:**
   ```bash
   uvicorn main:app --reload
   ```
   The backend will be running at `http://localhost:8000`.

---

### 2. Frontend Setup

1. **Navigate to the frontend directory:**
   ```bash
   cd frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```
   The frontend will be running at `http://localhost:5173`.

---

## Usage

1. Open your browser to the frontend local URL.
2. Click **Upload Repository** and select a `.zip` file of a codebase.
3. Wait for the file to be extracted, embedded, and indexed in the background.
4. Once indexing is complete, use the **Ask Questions** bar to interact with your codebase contextually!
