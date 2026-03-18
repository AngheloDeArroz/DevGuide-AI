import { useState, useEffect, useRef, useMemo } from 'react'
import { Upload, Search, Code, Loader2, Github, Trash2, LogOut, User, Plus, MessageSquare, ChevronRight } from 'lucide-react'
import axios from 'axios'
import { useAuth } from './AuthProvider'
import AuthPage from './AuthPage'
import './App.css'

function App() {
  const { session, user, loading, signOut } = useAuth()

  // Repo state
  const [repoFile, setRepoFile] = useState(null)
  const [githubUrl, setGithubUrl] = useState('')
  const [repoId, setRepoId] = useState(localStorage.getItem('repoId') || '')
  const [repoName, setRepoName] = useState(localStorage.getItem('repoName') || '')
  const [uploadStatus, setUploadStatus] = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [repos, setRepos] = useState([])

  // Conversation state
  const [conversations, setConversations] = useState([])
  const [activeConvId, setActiveConvId] = useState(null)
  const [messages, setMessages] = useState([])
  const [question, setQuestion] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const messagesEndRef = useRef(null)
  const API_URL = "http://localhost:8000"

  // Authenticated axios instance
  const api = useMemo(() => {
    const instance = axios.create({ baseURL: API_URL })
    instance.interceptors.request.use((config) => {
      const token = session?.access_token
      if (token) config.headers.Authorization = `Bearer ${token}`
      return config
    })
    return instance
  }, [session])

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Fetch repos on login
  useEffect(() => {
    if (session) fetchRepos()
  }, [session])

  // Fetch conversations when repo changes
  useEffect(() => {
    if (repoId) {
      fetchConversations(repoId)
      setActiveConvId(null)
      setMessages([])
    } else {
      setConversations([])
      setActiveConvId(null)
      setMessages([])
    }
  }, [repoId])

  // Load messages when active conversation changes
  useEffect(() => {
    if (activeConvId) loadMessages(activeConvId)
    else setMessages([])
  }, [activeConvId])

  const fetchRepos = async () => {
    try {
      const res = await api.get('/repos')
      const repoList = res.data.repos || res.data || []
      setRepos(Array.isArray(repoList) ? repoList : [])
    } catch (error) {
      console.error('Failed to fetch repos:', error)
    }
  }

  const fetchConversations = async (rid) => {
    try {
      const res = await api.get(`/conversations?repo_id=${rid}`)
      setConversations(res.data.conversations || [])
    } catch (error) {
      console.error('Failed to fetch conversations:', error)
    }
  }

  const loadMessages = async (convId) => {
    try {
      const res = await api.get(`/conversations/${convId}/messages`)
      setMessages(res.data.messages || [])
    } catch (error) {
      console.error('Failed to load messages:', error)
    }
  }

  const handleNewConversation = async () => {
    if (!repoId) return
    try {
      const res = await api.post('/conversations', { repo_id: repoId })
      const newConv = { id: res.data.id, title: res.data.title, updated_at: new Date().toISOString() }
      setConversations(prev => [newConv, ...prev])
      setActiveConvId(res.data.id)
      setMessages([])
    } catch (error) {
      console.error('Failed to create conversation:', error)
    }
  }

  const handleAskQuestion = async (e) => {
    e.preventDefault()
    if (!question.trim()) return

    if (!repoId) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Please select a repository first before asking questions.', id: Date.now() }])
      return
    }

    // Ensure there's an active conversation
    let convId = activeConvId
    if (!convId) {
      try {
        const res = await api.post('/conversations', { repo_id: repoId })
        convId = res.data.id
        setActiveConvId(convId)
        setConversations(prev => [{ id: convId, title: res.data.title, updated_at: new Date().toISOString() }, ...prev])
      } catch (error) {
        console.error('Failed to create conversation:', error)
        return
      }
    }

    const userMessage = { id: `tmp-user-${Date.now()}`, role: 'user', content: question }
    setMessages(prev => [...prev, userMessage])
    const sentQuestion = question
    setQuestion('')
    setIsLoading(true)

    try {
      const res = await api.post(`/conversations/${convId}/ask`, { question: sentQuestion })

      const assistantMessage = {
        id: `tmp-ai-${Date.now()}`,
        role: 'assistant',
        content: res.data.answer,
        context: res.data.context || []
      }
      setMessages(prev => [...prev, assistantMessage])

      // Refresh conversation list to get updated title/timestamp
      fetchConversations(repoId)
    } catch (error) {
      setMessages(prev => [...prev, {
        id: `tmp-err-${Date.now()}`,
        role: 'assistant',
        content: `Error: ${error.response?.data?.detail || error.message}`
      }])
    } finally {
      setIsLoading(false)
    }
  }

  const selectRepo = (repo) => {
    setRepoId(repo.id)
    setRepoName(repo.name)
    localStorage.setItem('repoId', repo.id)
    localStorage.setItem('repoName', repo.name)
    setUploadStatus(`Switched to: ${repo.name}`)
  }

  const handleDeleteRepo = async (repoIdToDelete, repoNameToDelete) => {
    if (!window.confirm(`Are you sure you want to delete "${repoNameToDelete}"? This will remove all indexed data.`)) return
    try {
      await api.delete(`/repos/${repoIdToDelete}`)
      if (repoIdToDelete === repoId) {
        setRepoId('')
        setRepoName('')
        localStorage.removeItem('repoId')
        localStorage.removeItem('repoName')
        setMessages([])
        setConversations([])
        setActiveConvId(null)
      }
      setUploadStatus(`Deleted: ${repoNameToDelete}`)
      fetchRepos()
    } catch (error) {
      setUploadStatus(`Error deleting repo: ${error.response?.data?.detail || error.message}`)
    }
  }

  const handleClearActiveRepo = () => {
    setRepoId('')
    setRepoName('')
    localStorage.removeItem('repoId')
    localStorage.removeItem('repoName')
    setMessages([])
    setConversations([])
    setActiveConvId(null)
    setUploadStatus('Cleared active repository.')
  }

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setRepoFile(e.target.files[0])
      setUploadStatus(`Selected: ${e.target.files[0].name}`)
      setUploadProgress(0)
    }
  }

  const handleUpload = async () => {
    if (!repoFile) { setUploadStatus('Please select a ZIP file first.'); return }
    setUploadStatus('Uploading repository...')
    const formData = new FormData()
    formData.append('file', repoFile)
    try {
      const uploadRes = await api.post('/upload-repo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => setUploadProgress(Math.round((e.loaded * 100) / e.total))
      })
      const newRepoId = uploadRes.data.repo_id
      const newRepoName = uploadRes.data.repo_name || repoFile.name
      setRepoId(newRepoId)
      setRepoName(newRepoName)
      localStorage.setItem('repoId', newRepoId)
      localStorage.setItem('repoName', newRepoName)
      setUploadStatus('Extracting & indexing code... (this may take a minute)')
      await api.post(`/index-code?repo_id=${newRepoId}`)
      setUploadStatus('Indexing started! You can start asking questions.')
      fetchRepos()
    } catch (error) {
      setUploadStatus(`Error: ${error.response?.data?.detail || error.message}`)
      setUploadProgress(0)
    }
  }

  const handleGithubUpload = async (e) => {
    e.preventDefault()
    if (!githubUrl.trim()) return
    setUploadStatus('Cloning repository...')
    try {
      const uploadRes = await api.post('/upload-github-repo', { url: githubUrl })
      const newRepoId = uploadRes.data.repo_id
      const newRepoName = uploadRes.data.repo_name || githubUrl.split('/').pop()
      setRepoId(newRepoId)
      setRepoName(newRepoName)
      localStorage.setItem('repoId', newRepoId)
      localStorage.setItem('repoName', newRepoName)
      setUploadStatus('Indexing code from GitHub...')
      await api.post(`/index-code?repo_id=${newRepoId}`)
      setUploadStatus('Indexing started! You can start asking questions.')
      setGithubUrl('')
      fetchRepos()
    } catch (error) {
      setUploadStatus(`Error: ${error.response?.data?.detail || error.message}`)
    }
  }

  const handleSignOut = async () => {
    await signOut()
    setRepos([])
    setRepoId('')
    setRepoName('')
    setMessages([])
    setConversations([])
    setActiveConvId(null)
  }

  const formatTime = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!session) return <AuthPage />

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 transition-shadow hover:shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Code className="text-white w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">DevGuide AI</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-100 px-3 py-2 rounded-xl">
              <User className="w-4 h-4" />
              <span className="hidden sm:inline max-w-[200px] truncate">{user?.email}</span>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 text-sm text-slate-500 hover:text-red-600 bg-slate-100 hover:bg-red-50 px-3 py-2 rounded-xl transition-all border border-transparent hover:border-red-200"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 flex flex-col lg:flex-row gap-8">

        {/* Left Column: Upload + Repo Management */}
        <section className="w-full lg:w-1/3 flex flex-col gap-6">

          {/* Active Repo Dropdown */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 transition-all hover:shadow-md">
            <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Code className="w-5 h-5 text-green-500" />
              Active Repository
            </h2>
            <div className="flex items-center gap-2">
              <select
                value={repoId}
                onChange={(e) => {
                  const selected = repos.find(r => r.id === e.target.value)
                  if (selected) selectRepo(selected)
                  else handleClearActiveRepo()
                }}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all appearance-none cursor-pointer"
              >
                <option value="">-- Select a repository --</option>
                {repos.map((repo) => (
                  <option key={repo.id} value={repo.id}>{repo.name}</option>
                ))}
              </select>
              {repoId && (
                <button
                  onClick={() => {
                    const activeRepo = repos.find(r => r.id === repoId)
                    if (activeRepo) handleDeleteRepo(activeRepo.id, activeRepo.name)
                  }}
                  className="text-red-400 hover:text-red-600 transition-colors p-2 hover:bg-red-50 rounded-xl border border-transparent hover:border-red-200 flex-shrink-0"
                  title="Delete this repository"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            {repos.length === 0 && (
              <p className="text-sm text-slate-400 text-center mt-3">No repositories yet. Upload one below.</p>
            )}
          </div>

          {/* Upload Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 transition-all hover:shadow-md">
            <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Upload className="w-5 h-5 text-blue-500" />
              Add Repository
            </h2>
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:bg-slate-50 transition-colors cursor-pointer relative group mb-4">
              <input
                type="file"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                accept=".zip"
                onChange={handleFileChange}
              />
              <div className="flex flex-col items-center gap-3 text-slate-500 group-hover:text-blue-600 transition-colors">
                <Upload className="w-8 h-8" />
                <p className="font-medium">{repoFile ? repoFile.name : "Click or drag ZIP file here"}</p>
                <p className="text-xs">Use github repo link if file is greater than 1GB</p>
              </div>
            </div>

            <button
              onClick={handleUpload}
              disabled={!repoFile || uploadProgress > 0}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-xl transition-all active:scale-[0.98] shadow-sm disabled:opacity-50 mb-6"
            >
              Upload & Index ZIP
            </button>

            <div className="relative flex items-center py-2 mb-4">
              <div className="flex-grow border-t border-slate-200"></div>
              <span className="flex-shrink-0 mx-4 text-slate-400 text-sm font-medium">OR</span>
              <div className="flex-grow border-t border-slate-200"></div>
            </div>

            <form onSubmit={handleGithubUpload} className="flex flex-col gap-3">
              <div className="relative flex items-center">
                <Github className="absolute left-3 w-5 h-5 text-slate-400" />
                <input
                  type="url"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/user/repo"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={!githubUrl || uploadProgress > 0}
                className="w-full bg-slate-800 hover:bg-slate-900 text-white font-medium py-2.5 rounded-xl transition-all active:scale-[0.98] shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Github className="w-5 h-5" />
                Fetch GitHub Repo
              </button>
            </form>

            {uploadProgress > 0 && uploadProgress < 100 && (
              <div className="w-full bg-slate-200 rounded-full h-2.5 mt-6">
                <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${uploadProgress}%` }}></div>
              </div>
            )}

            {uploadStatus && <p className="mt-4 text-sm text-center text-slate-600 font-medium">{uploadStatus}</p>}
          </div>
        </section>

        {/* Right Column: Chat */}
        <section className="w-full lg:w-2/3 flex flex-col gap-0 min-h-[600px]">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex-1 flex overflow-hidden" style={{ minHeight: '600px' }}>

            {/* Conversations Sidebar */}
            <div className="w-56 flex-shrink-0 border-r border-slate-100 flex flex-col bg-slate-50">
              <div className="p-3 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Conversations</span>
                {repoId && (
                  <button
                    onClick={handleNewConversation}
                    className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-100 transition-colors"
                    title="New conversation"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto">
                {!repoId ? (
                  <p className="text-xs text-slate-400 text-center mt-6 px-3">Select a repo to see conversations</p>
                ) : conversations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center mt-10 gap-2 text-slate-400 px-3">
                    <MessageSquare className="w-6 h-6 opacity-30" />
                    <p className="text-xs text-center">No conversations yet. Ask a question to start one!</p>
                  </div>
                ) : (
                  conversations.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => setActiveConvId(conv.id)}
                      className={`w-full text-left px-3 py-2.5 flex items-start gap-2 transition-colors border-b border-slate-100 group ${
                        activeConvId === conv.id
                          ? 'bg-blue-50 border-l-2 border-l-blue-500'
                          : 'hover:bg-white'
                      }`}
                    >
                      <MessageSquare className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${activeConvId === conv.id ? 'text-blue-500' : 'text-slate-400'}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium truncate leading-snug ${activeConvId === conv.id ? 'text-blue-700' : 'text-slate-700'}`}>
                          {conv.title}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">{formatTime(conv.updated_at)}</p>
                      </div>
                      {activeConvId === conv.id && <ChevronRight className="w-3 h-3 text-blue-400 flex-shrink-0 mt-0.5" />}
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 flex flex-col min-w-0">
              {/* Chat Header */}
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-indigo-500" />
                  <span className="text-sm font-semibold text-slate-900">Ask Questions</span>
                  {repoName && (
                    <span className="text-xs text-slate-400 ml-1">
                      — <span className="text-indigo-500 font-medium">{repoName}</span>
                    </span>
                  )}
                </div>
                {repoId && (
                  <button
                    onClick={handleNewConversation}
                    className="flex items-center gap-1.5 text-xs text-blue-600 hover:bg-blue-50 px-2.5 py-1.5 rounded-lg transition-colors font-medium border border-blue-200 hover:border-blue-300"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    New Chat
                  </button>
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
                {messages.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3 py-16">
                    <Search className="w-10 h-10 opacity-20" />
                    <p className="text-sm">Ask a question about your codebase to get started.</p>
                    {!repoId && <p className="text-xs text-slate-400">← Select a repository first</p>}
                  </div>
                ) : (
                  messages.map((msg, idx) => (
                    <div key={msg.id || idx} className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white rounded-br-sm'
                          : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                      }`}>
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      </div>

                      {/* Retrieved context for assistant messages */}
                      {msg.role === 'assistant' && msg.context && msg.context.length > 0 && (
                        <details className="max-w-[85%] mt-1">
                          <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600 select-none">
                            {msg.context.length} code snippet{msg.context.length !== 1 ? 's' : ''} retrieved
                          </summary>
                          <div className="mt-2 flex flex-col gap-2">
                            {msg.context.map((ctx, i) => (
                              <div key={i} className="bg-slate-800 rounded-lg overflow-hidden border border-slate-700 text-xs">
                                <div className="bg-slate-900 px-3 py-1.5 text-slate-300 font-mono border-b border-slate-700 flex justify-between">
                                  <span className="truncate">{ctx.file_path}</span>
                                  <span className="text-slate-500 ml-2 flex-shrink-0">{(ctx.similarity * 100).toFixed(1)}%</span>
                                </div>
                                <pre className="p-3 font-mono text-slate-300 overflow-x-auto m-0"><code>{ctx.content}</code></pre>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  ))
                )}

                {isLoading && (
                  <div className="flex items-start">
                    <div className="bg-slate-100 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
                      <span className="text-sm text-slate-500">Searching codebase…</span>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="px-5 py-4 border-t border-slate-100">
                <form className="relative flex items-center" onSubmit={handleAskQuestion}>
                  <input
                    type="text"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder={repoId ? "How does the authentication flow work?" : "Select a repository first…"}
                    className="w-full bg-slate-100 border-none rounded-xl py-3.5 pl-5 pr-14 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                    disabled={isLoading || !repoId}
                  />
                  <button
                    type="submit"
                    className="absolute right-2 bg-blue-600 text-white p-2.5 rounded-lg hover:bg-blue-700 transition-colors active:scale-95 disabled:opacity-50"
                    disabled={isLoading || !question.trim() || !repoId}
                  >
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </section>

      </main>
    </div>
  )
}

export default App
