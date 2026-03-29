import { useState } from 'react'
import { useTheme } from './ThemeContext'
import AuthPage from './AuthPage'
import {
  Code, Zap, Shield, Search, GitBranch, Brain,
  ArrowRight, Sun, Moon, ChevronDown, Sparkles
} from 'lucide-react'

const features = [
  {
    icon: Brain,
    title: 'AI-Powered Understanding',
    description: 'Ask questions in plain English and get precise answers grounded in your actual code — powered by Gemini.',
    color: 'from-blue-500 to-indigo-500',
  },
  {
    icon: Search,
    title: 'Semantic Code Search',
    description: 'Find relevant functions, classes, and logic across your entire codebase using vector similarity search.',
    color: 'from-violet-500 to-purple-500',
  },
  {
    icon: GitBranch,
    title: 'GitHub Integration',
    description: 'Import any public GitHub repository with one click. We\'ll clone, parse, and index it automatically.',
    color: 'from-emerald-500 to-teal-500',
  },
  {
    icon: Zap,
    title: 'Blazing Fast Retrieval',
    description: 'pgvector-powered HNSW indexes deliver sub-second semantic search across thousands of code chunks.',
    color: 'from-amber-500 to-orange-500',
  },
  {
    icon: Code,
    title: 'AST-Level Chunking',
    description: 'Tree-sitter parses your code at the function and class level — not arbitrary text blocks — for higher quality results.',
    color: 'from-rose-500 to-pink-500',
  },
  {
    icon: Shield,
    title: 'Private & Secure',
    description: 'Your repositories are linked to your account. Nobody else can see or query your code.',
    color: 'from-cyan-500 to-blue-500',
  },
]

export default function LandingPage() {
  const { theme, toggleTheme } = useTheme()
  const [showAuth, setShowAuth] = useState(false)

  if (showAuth) return <AuthPage onBack={() => setShowAuth(false)} />

  return (
    <div className={`min-h-screen transition-colors duration-300 ${
      theme === 'dark'
        ? 'bg-slate-950 text-white'
        : 'bg-white text-slate-900'
    }`}>

      {/* ── Navbar ─────────────────────────────────────────────── */}
      <nav className={`sticky top-0 z-50 backdrop-blur-xl border-b ${
        theme === 'dark'
          ? 'bg-slate-950/80 border-white/10'
          : 'bg-white/80 border-slate-200'
      }`}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-500/25">
              <Code className="text-white w-5 h-5" />
            </div>
            <span className="text-xl font-bold tracking-tight">DevGuide AI</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className={`p-2 rounded-xl transition-all ${
                theme === 'dark'
                  ? 'hover:bg-white/10 text-slate-400 hover:text-white'
                  : 'hover:bg-slate-100 text-slate-500 hover:text-slate-900'
              }`}
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button
              onClick={() => setShowAuth(true)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                theme === 'dark'
                  ? 'text-slate-300 hover:text-white hover:bg-white/10'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setShowAuth(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-xl text-sm font-semibold transition-all shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 active:scale-[0.98]"
            >
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero Section ───────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Animated background blobs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className={`absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full blur-3xl ${
            theme === 'dark' ? 'bg-blue-600/15' : 'bg-blue-400/20'
          } animate-pulse`} />
          <div className={`absolute top-1/2 -left-40 w-[500px] h-[500px] rounded-full blur-3xl ${
            theme === 'dark' ? 'bg-indigo-600/10' : 'bg-indigo-300/20'
          } animate-pulse`} style={{ animationDelay: '2s' }} />
          <div className={`absolute -bottom-20 right-1/4 w-[400px] h-[400px] rounded-full blur-3xl ${
            theme === 'dark' ? 'bg-violet-600/10' : 'bg-violet-300/15'
          } animate-pulse`} style={{ animationDelay: '4s' }} />
        </div>

        <div className="max-w-6xl mx-auto px-6 pt-24 pb-20 md:pt-32 md:pb-28 relative">
          <div className="text-center max-w-3xl mx-auto">
            {/* Badge */}
            <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide uppercase mb-8 ${
              theme === 'dark'
                ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
                : 'bg-blue-50 text-blue-600 border border-blue-100'
            }`}>
              <Sparkles className="w-3.5 h-3.5" />
              AI-Powered RAG Code Assistant
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.1] mb-6">
              Understand any codebase{' '}
              <span className="bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 bg-clip-text text-transparent">
                in seconds
              </span>
            </h1>

            {/* Subheadline */}
            <p className={`text-lg md:text-xl leading-relaxed max-w-2xl mx-auto mb-10 ${
              theme === 'dark' ? 'text-slate-400' : 'text-slate-600'
            }`}>
              Upload your repository or paste a GitHub link. Ask questions in plain English.
              Get accurate, context-aware answers powered by semantic search and Gemini AI.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => setShowAuth(true)}
                className="group bg-blue-600 hover:bg-blue-500 text-white px-8 py-3.5 rounded-2xl text-base font-semibold transition-all shadow-xl shadow-blue-500/25 hover:shadow-blue-500/40 active:scale-[0.98] flex items-center gap-2"
              >
                Start Exploring
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
              <a
                href="#features"
                className={`px-8 py-3.5 rounded-2xl text-base font-medium transition-all flex items-center gap-2 ${
                  theme === 'dark'
                    ? 'text-slate-300 hover:text-white hover:bg-white/10 border border-white/10'
                    : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                See Features
                <ChevronDown className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Hero Visual — code terminal mock */}
          <div className={`mt-16 md:mt-20 max-w-3xl mx-auto rounded-2xl overflow-hidden shadow-2xl border ${
            theme === 'dark'
              ? 'bg-slate-900 border-white/10 shadow-black/40'
              : 'bg-slate-900 border-slate-200 shadow-slate-300/50'
          }`}>
            {/* Terminal title bar */}
            <div className="flex items-center gap-2 px-4 py-3 bg-slate-800 border-b border-white/5">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                <div className="w-3 h-3 rounded-full bg-green-500/80" />
              </div>
              <span className="text-xs text-slate-500 ml-2 font-mono">DevGuide AI — Chat</span>
            </div>
            {/* Fake conversation */}
            <div className="p-6 font-mono text-sm space-y-4">
              <div className="flex gap-3">
                <span className="text-blue-400 flex-shrink-0">You:</span>
                <span className="text-slate-300">How does the authentication middleware work?</span>
              </div>
              <div className="flex gap-3">
                <span className="text-emerald-400 flex-shrink-0">AI:</span>
                <span className="text-slate-400">
                  The auth flow is in <span className="text-amber-300">`auth.py`</span>. It fetches
                  the Supabase JWKS public key at startup, then the{' '}
                  <span className="text-amber-300">`get_current_user()`</span> dependency verifies
                  every request's JWT using ES256. If the token is expired or invalid, it returns a
                  401 with a clear message.
                </span>
              </div>
              <div className="flex gap-3 opacity-60">
                <span className="text-blue-400 flex-shrink-0">You:</span>
                <span className="text-slate-400 animate-pulse">▌</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features Section ───────────────────────────────────── */}
      <section id="features" className={`py-20 md:py-28 border-t ${
        theme === 'dark' ? 'border-white/5 bg-slate-900/50' : 'border-slate-100 bg-slate-50/50'
      }`}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4">
              Everything you need to explore code
            </h2>
            <p className={`text-lg max-w-2xl mx-auto ${
              theme === 'dark' ? 'text-slate-400' : 'text-slate-600'
            }`}>
              From ingestion to insight — a complete AI pipeline for understanding any codebase.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div
                key={feature.title}
                className={`group p-6 rounded-2xl border transition-all duration-300 hover:-translate-y-1 ${
                  theme === 'dark'
                    ? 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06] hover:border-white/20'
                    : 'bg-white border-slate-200 hover:shadow-lg hover:border-slate-300'
                }`}
              >
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform`}>
                  <feature.icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className={`text-sm leading-relaxed ${
                  theme === 'dark' ? 'text-slate-400' : 'text-slate-600'
                }`}>
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ───────────────────────────────────────── */}
      <section className={`py-20 md:py-28 border-t ${
        theme === 'dark' ? 'border-white/5' : 'border-slate-100'
      }`}>
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4">
              Three steps to clarity
            </h2>
            <p className={`text-lg ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
              From repository to answers in under a minute.
            </p>
          </div>

          <div className="flex flex-col gap-8">
            {[
              { step: '01', title: 'Upload your repository', desc: 'Drop a ZIP file or paste a GitHub URL. We support Python, JavaScript, TypeScript, PHP, Java, and C++.' },
              { step: '02', title: 'We index & embed your code', desc: 'Tree-sitter parses every function and class. Sentence-transformers creates semantic embeddings stored in pgvector.' },
              { step: '03', title: 'Ask anything', desc: 'Type a question in plain English. We find the most relevant code, send it to Gemini, and return a precise answer.' },
            ].map((item) => (
              <div
                key={item.step}
                className={`flex items-start gap-6 p-6 rounded-2xl border transition-all ${
                  theme === 'dark'
                    ? 'bg-white/[0.02] border-white/10 hover:bg-white/[0.05]'
                    : 'bg-white border-slate-200 hover:shadow-md'
                }`}
              >
                <div className="text-3xl font-black bg-gradient-to-br from-blue-500 to-indigo-500 bg-clip-text text-transparent flex-shrink-0 w-12">
                  {item.step}
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-1">{item.title}</h3>
                  <p className={`text-sm leading-relaxed ${
                    theme === 'dark' ? 'text-slate-400' : 'text-slate-600'
                  }`}>
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────── */}
      <section className={`py-20 md:py-28 border-t ${
        theme === 'dark' ? 'border-white/5' : 'border-slate-100'
      }`}>
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4">
            Ready to explore your code?
          </h2>
          <p className={`text-lg mb-8 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
            Create a free account and start asking questions in seconds.
          </p>
          <button
            onClick={() => setShowAuth(true)}
            className="group bg-blue-600 hover:bg-blue-500 text-white px-10 py-4 rounded-2xl text-lg font-semibold transition-all shadow-xl shadow-blue-500/25 hover:shadow-blue-500/40 active:scale-[0.98] inline-flex items-center gap-2"
          >
            Get Started Free
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className={`py-8 border-t text-center text-sm ${
        theme === 'dark'
          ? 'border-white/5 text-slate-500'
          : 'border-slate-100 text-slate-400'
      }`}>
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-1.5 rounded-lg">
              <Code className="text-white w-3.5 h-3.5" />
            </div>
            <span className="font-semibold">DevGuide AI</span>
          </div>
          <span>© {new Date().getFullYear()} DevGuide AI. Built with FastAPI, pgvector & Gemini.</span>
        </div>
      </footer>
    </div>
  )
}
