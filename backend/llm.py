"""
LLM integration for DevGuide AI (Google Gemini).

Optimizations:
 - Response caching by question + context hash
 - Approximate token counting for cost monitoring
 - Error handling with structured logging
"""

import os
import logging

import google.generativeai as genai
from dotenv import load_dotenv

from cache import llm_cache, hash_key
from cost_monitor import monitor

load_dotenv()
logger = logging.getLogger(__name__)

# Configure Gemini API
API_KEY = os.getenv("GEMINI_API_KEY")
if not API_KEY:
    logger.warning("GEMINI_API_KEY not found in environment variables.")
else:
    genai.configure(api_key=API_KEY)

model = genai.GenerativeModel("gemini-2.5-flash")


def _approx_tokens(text: str) -> int:
    """Rough token estimate: ~4 chars per token for English/code."""
    return len(text) // 4


def generate_explanation(question: str, context_chunks: list[dict]) -> str:
    """Generate an LLM answer for a user question given retrieved code context."""
    # Build a deterministic cache key from question + context
    context_str = "|".join(c.get("content", "") for c in context_chunks)
    cache_key = hash_key(question, context_str)

    cached = llm_cache.get(cache_key)
    if cached is not None:
        monitor.inc("cache_hits")
        logger.info("[llm] Cache HIT — returning cached response")
        return cached

    monitor.inc("cache_misses")

    # ── Build RAG prompt ──────────────────────────────────────────────
    system = (
        "You are DevGuide AI, an expert software engineer assistant. "
        "You help developers understand codebases by answering questions "
        "using only the code snippets provided below. "
        "Be precise, reference specific file paths and function names, "
        "and keep your answers concise."
    )

    # Code context block
    context_block = []
    for i, chunk in enumerate(context_chunks):
        context_block.append(
            f"### File: `{chunk['file_path']}` (snippet {i + 1})\n"
            f"```\n{chunk['content']}\n```"
        )
    code_context = "\n\n".join(context_block)

    prompt = (
        f"{system}\n\n"
        f"---\n\n"
        f"**User Question:** {question}\n\n"
        f"---\n\n"
        f"**Relevant Code:**\n\n{code_context}\n\n"
        f"---\n\n"
        f"**Guidelines:**\n"
        f"- Answer the question directly and concisely.\n"
        f"- Reference file paths and function/class names using inline code (`backticks`).\n"
        f"- Use markdown code blocks with the correct language tag when showing code.\n"
        f"- If the provided code does not contain enough information to answer, say so clearly.\n"
        f"- Do not fabricate code that is not in the snippets above."
    )


    # Track approximate token usage
    prompt_tokens = _approx_tokens(prompt)
    monitor.inc("llm_tokens_approx", prompt_tokens)

    try:
        with monitor.timer("llm_latency_ms", "llm_calls"):
            response = model.generate_content(prompt)

        answer = response.text

        # Track response tokens
        response_tokens = _approx_tokens(answer)
        monitor.inc("llm_tokens_approx", response_tokens)

        # Cache the result
        llm_cache.set(cache_key, answer)

        return answer

    except Exception as e:
        logger.error(f"[llm] Error generating explanation from Gemini: {e}")
        return "Sorry, I encountered an error while trying to generate the explanation."
