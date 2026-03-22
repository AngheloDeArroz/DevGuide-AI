import { useState, useEffect, useRef, useMemo } from 'react'
import { 
  Upload, Code, Loader2, Github, Trash2, 
  LogOut, User, Plus, MessageSquare, ChevronRight, X,
  SendHorizontal, ChevronDown, Database, PanelLeftClose, PanelLeftOpen,
  Menu
} from 'lucide-react'
import axios from 'axios'
import { useAuth } from './AuthProvider'
import AuthPage from './AuthPage'
import './App.css'

function App() {
  const { session, user, loading, signOut } = useAuth()

  // UI State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isRepoDropdownOpen, setIsRepoDropdownOpen] = useState(false)
  const repoDropdownRef = useRef(null)

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

  // Fetch conversations when repo changes — only when session is ready
  useEffect(() => {
    if (!session) return
    if (repoId) {
      fetchConversations(repoId)
      setActiveConvId(null)
      setMessages([])
    } else {
      setConversations([])
      setActiveConvId(null)
      setMessages([])
    }
  }, [repoId, session])

  // Load messages when active conversation changes
  useEffect(() => {
    if (activeConvId) loadMessages(activeConvId)
    else setMessages([])
  }, [activeConvId])

  // Close repo dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (repoDropdownRef.current && !repoDropdownRef.current.contains(e.target)) {
        setIsRepoDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
      // On mobile, close sidebar after starting chat
      if (window.innerWidth < 768) setIsSidebarOpen(false)
    } catch (error) {
      console.error('Failed to create conversation:', error)
    }
  }

  const handleDeleteConversation = async (convId, e) => {
    e.stopPropagation()
    if (!window.confirm('Delete this conversation?')) return
    try {
      await api.delete(`/conversations/${convId}`)
      setConversations(prev => prev.filter(c => c.id !== convId))
      if (activeConvId === convId) {
        setActiveConvId(null)
        setMessages([])
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error)
      // Optimistically remove anyway if endpoint doesn't exist yet
      setConversations(prev => prev.filter(c => c.id !== convId))
      if (activeConvId === convId) {
        setActiveConvId(null)
        setMessages([])
      }
    }
  }

  const handleAskQuestion = async (e) => {
    e.preventDefault()
    if (!question.trim()) return

    if (!repoId) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Please select a repository first before asking questions.', id: Date.now() }])
      return
    }

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
    setIsRepoDropdownOpen(false)
  }

  const handleDeleteRepo = async (repoIdToDelete, repoNameToDelete, e) => {
    e && e.stopPropagation()
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
      fetchRepos()
    } catch (error) {
      alert(`Error deleting repo: ${error.response?.data?.detail || error.message}`)
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
      
      setUploadStatus('Extracting & indexing code...')
      await api.post(`/index-code?repo_id=${newRepoId}`)
      
      fetchRepos()
      setUploadStatus('')
      setRepoFile(null)
      setIsUploadModalOpen(false)
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
      
      setGithubUrl('')
      fetchRepos()
      setUploadStatus('')
      setIsUploadModalOpen(false)
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

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!session) return <AuthPage />

  return (
    <div className="flex h-screen bg-white text-slate-800 font-sans overflow-hidden">
      
      {/* Mobile overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/40 z-20 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <aside className={`
        fixed md:relative z-30
        h-full flex flex-col flex-shrink-0
        bg-slate-50 border-r border-slate-200
        transition-all duration-300 ease-in-out
        ${isSidebarOpen ? 'w-72 translate-x-0' : 'w-0 md:w-16 -translate-x-full md:translate-x-0'}
        overflow-hidden
      `}>

        {/* Logo & App Name + Collapse Button */}
        <div className="p-4 flex items-center border-b border-slate-200" style={{ minWidth: isSidebarOpen ? '18rem' : '4rem' }}>
          {/* Logo icon — always visible */}
          <div className="bg-blue-600 p-2 rounded-lg flex-shrink-0">
            <Code className="text-white w-5 h-5" />
          </div>
          {/* Title — only when expanded */}
          <h1 className={`text-xl font-bold text-slate-900 tracking-tight whitespace-nowrap ml-3 transition-all duration-200 overflow-hidden ${isSidebarOpen ? 'opacity-100 max-w-xs' : 'opacity-0 max-w-0 ml-0'}`}>
            DevGuide AI
          </h1>
          {/* Toggle button — only on desktop, pushed to the right */}
          {isSidebarOpen && (
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="ml-auto p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors hidden md:flex flex-shrink-0"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Content only visible when open */}
        <div className={`flex flex-col flex-1 overflow-hidden transition-opacity duration-200 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          
          {/* Repository Selector */}
          <div className="p-4 border-b border-slate-200 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Workspace</span>
              <button 
                onClick={() => setIsUploadModalOpen(true)}
                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 p-1 rounded-md transition-colors"
                title="Add Repository"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            
            {/* Modern custom dropdown */}
            <div className="relative" ref={repoDropdownRef}>
              <button
                type="button"
                onClick={() => setIsRepoDropdownOpen(v => !v)}
                className={`w-full flex items-center gap-2 bg-white border rounded-xl px-3 py-2.5 text-sm text-left transition-all shadow-sm
                  ${isRepoDropdownOpen 
                    ? 'border-blue-500 ring-2 ring-blue-200' 
                    : 'border-slate-200 hover:border-slate-300'
                  }`}
              >
                <Database className={`w-4 h-4 flex-shrink-0 ${repoId ? 'text-blue-600' : 'text-slate-400'}`} />
                <span className={`flex-1 truncate ${repoId ? 'text-slate-900 font-medium' : 'text-slate-400'}`}>
                  {repoName || 'Select a repository'}
                </span>
                <ChevronDown className={`w-4 h-4 flex-shrink-0 text-slate-400 transition-transform duration-200 ${isRepoDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown list */}
              {isRepoDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg z-40 overflow-hidden">
                  {/* Clear selection */}
                  <button
                    onClick={() => { handleClearActiveRepo(); setIsRepoDropdownOpen(false) }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-500 hover:bg-slate-50 transition-colors border-b border-slate-100"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>None</span>
                  </button>

                  {repos.length === 0 ? (
                    <div className="px-3 py-4 text-center text-xs text-slate-400">No repositories yet</div>
                  ) : (
                    <div className="max-h-48 overflow-y-auto">
                      {repos.map((repo) => (
                        <div
                          key={repo.id}
                          className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors group
                            ${repo.id === repoId ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-700'}`}
                        >
                          <button
                            className="flex-1 flex items-center gap-2 text-sm text-left min-w-0"
                            onClick={() => selectRepo(repo)}
                          >
                            <Database className={`w-3.5 h-3.5 flex-shrink-0 ${repo.id === repoId ? 'text-blue-500' : 'text-slate-400'}`} />
                            <span className="truncate font-medium">{repo.name}</span>
                          </button>
                          <button
                            onClick={(e) => handleDeleteRepo(repo.id, repo.name, e)}
                            className="p-1 rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                            title={`Delete ${repo.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add new */}
                  <button
                    onClick={() => { setIsUploadModalOpen(true); setIsRepoDropdownOpen(false) }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-blue-600 hover:bg-blue-50 transition-colors border-t border-slate-100 font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add repository</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* New Chat Button */}
          <div className="p-4">
            <button
              onClick={handleNewConversation}
              disabled={!repoId}
              className="w-full flex items-center justify-center gap-2 bg-white border border-slate-200 hover:border-blue-400 hover:text-blue-600 text-slate-700 text-sm font-medium py-2 rounded-lg transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              New Chat
            </button>
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto px-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1 mb-2 block">Recent</span>
            {!repoId ? (
              <p className="text-xs text-slate-400 text-center mt-6">Select a repo to see chats</p>
            ) : conversations.length === 0 ? (
              <p className="text-xs text-slate-400 text-center mt-6">No conversations yet.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={`group w-full flex items-center gap-2 rounded-lg transition-all cursor-pointer
                      ${activeConvId === conv.id
                        ? 'bg-blue-100 text-blue-700'
                        : 'hover:bg-slate-200 text-slate-600'
                      }`}
                  >
                    <button
                      onClick={() => {
                        setActiveConvId(conv.id)
                        if (window.innerWidth < 768) setIsSidebarOpen(false)
                      }}
                      className="flex-1 flex items-center gap-2 px-3 py-2 min-w-0 text-left"
                    >
                      <MessageSquare className={`w-4 h-4 flex-shrink-0 ${activeConvId === conv.id ? 'text-blue-600' : 'text-slate-400'}`} />
                      <span className="text-sm truncate">{conv.title}</span>
                    </button>
                    <button
                      onClick={(e) => handleDeleteConversation(conv.id, e)}
                      className="p-1.5 mr-1.5 rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                      title="Delete conversation"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* User Profile & Logout */}
          <div className="p-4 border-t border-slate-200 bg-slate-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-slate-600 overflow-hidden">
                <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <User className="w-3.5 h-3.5 text-blue-600" />
                </div>
                <span className="truncate text-xs">{user?.email}</span>
              </div>
              <button
                onClick={handleSignOut}
                className="text-slate-400 hover:text-red-600 p-1.5 rounded-md hover:bg-red-50 transition-colors flex-shrink-0"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN CHAT AREA */}
      <main className="flex-1 flex flex-col h-full relative bg-white min-w-0">
        {/* Chat Header */}
        <header className="h-14 md:h-16 border-b border-slate-100 flex items-center px-3 md:px-6 justify-between flex-shrink-0 gap-2">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            {/* Mobile hamburger */}
            <button
              onClick={() => setIsSidebarOpen(v => !v)}
              className="md:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors flex-shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>
            {/* Desktop collapse toggle (when collapsed) */}
            {!isSidebarOpen && (
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="hidden md:flex p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors flex-shrink-0"
                title="Expand sidebar"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            )}
            <h2 className="text-base md:text-lg font-semibold text-slate-800 flex items-center gap-2 min-w-0">
              {repoName ? (
                <>
                  <Code className="w-4 h-4 md:w-5 md:h-5 text-indigo-500 flex-shrink-0" />
                  <span className="truncate">{repoName}</span>
                </>
              ) : (
                <span className="text-slate-400 font-normal text-sm md:text-base">Select a repository to begin</span>
              )}
            </h2>
          </div>
          
          {/* Quick action: add repo on mobile */}
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="md:hidden p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors flex-shrink-0"
            title="Add Repository"
          >
            <Plus className="w-5 h-5" />
          </button>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col gap-6">
          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-4 mt-20">
              <div className="bg-slate-50 p-4 rounded-full">
                <Code className="w-8 h-8 text-slate-300" />
              </div>
              <p className="text-slate-500 font-medium text-base md:text-lg text-center px-4">How can I help you with your code?</p>
              {!repoId && <p className="text-sm text-center px-4">← Please select or add a repository first</p>}
            </div>
          ) : (
            <div className="max-w-4xl mx-auto w-full flex flex-col gap-6">
              {messages.map((msg, idx) => (
                <div key={msg.id || idx} className={`flex gap-3 md:gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  
                  {/* Avatar for Assistant */}
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-1">
                      <Code className="w-4 h-4 text-blue-600" />
                    </div>
                  )}

                  <div className={`flex flex-col gap-1 ${msg.role === 'user' ? 'max-w-[85%] md:max-w-[75%] items-end' : 'max-w-[90%] md:max-w-[85%] items-start'}`}>
                    <div className={`px-4 py-3 md:px-5 md:py-3.5 rounded-2xl text-[14px] md:text-[15px] leading-relaxed shadow-sm ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white rounded-br-sm'
                        : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'
                    }`}>
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    </div>

                    {/* Context Accordion */}
                    {msg.role === 'assistant' && msg.context && msg.context.length > 0 && (
                      <details className="w-full mt-2 group">
                        <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700 select-none flex items-center gap-1 transition-colors bg-slate-50 w-fit px-3 py-1.5 rounded-full border border-slate-200">
                          <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform" />
                          View {msg.context.length} source snippet{msg.context.length !== 1 ? 's' : ''}
                        </summary>
                        <div className="mt-3 flex flex-col gap-3 pl-2">
                          {msg.context.map((ctx, i) => (
                            <div key={i} className="bg-[#1e1e1e] rounded-xl overflow-hidden border border-slate-800 shadow-sm">
                              <div className="bg-[#2d2d2d] px-4 py-2 text-slate-300 font-mono text-xs flex justify-between items-center">
                                <span className="truncate flex-1">{ctx.file_path}</span>
                                <span className="text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded ml-3">
                                  {(ctx.similarity * 100).toFixed(0)}% match
                                </span>
                              </div>
                              <pre className="p-4 font-mono text-sm text-slate-300 overflow-x-auto m-0"><code>{ctx.content}</code></pre>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              ))}
              
              {isLoading && (
                <div className="flex gap-3 md:gap-4 items-start">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-1">
                    <Code className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-4 py-3 md:px-5 md:py-3.5 flex items-center gap-3 shadow-sm">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                    <span className="text-[14px] md:text-[15px] text-slate-500">Searching codebase...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-3 md:p-6 bg-white/80 backdrop-blur-sm border-t border-slate-100 flex-shrink-0">
          <div className="max-w-4xl mx-auto relative">
            <form onSubmit={handleAskQuestion} className="relative flex items-end shadow-sm border border-slate-300 bg-white rounded-2xl overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-all">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleAskQuestion(e);
                  }
                }}
                placeholder={repoId ? "Ask a question about your code..." : "Select a repository to ask questions"}
                className="w-full max-h-48 min-h-[52px] md:min-h-[56px] py-3.5 md:py-4 pl-4 md:pl-5 pr-14 text-slate-900 bg-transparent resize-none outline-none text-[14px] md:text-[15px]"
                disabled={isLoading || !repoId}
                rows={1}
              />
              <button
                type="submit"
                className="absolute right-3 bottom-2 md:bottom-2.5 bg-blue-600 text-white p-2 rounded-xl hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center h-9 w-9 shadow-sm"
                disabled={isLoading || !question.trim() || !repoId}
              >
                {isLoading 
                  ? <Loader2 className="w-4 h-4 animate-spin" /> 
                  : <SendHorizontal className="w-4 h-4" />
                }
              </button>
            </form>
            <p className="text-center text-xs text-slate-400 mt-2 hidden sm:block">
              Press Enter to send, Shift+Enter for new line.
            </p>
          </div>
        </div>
      </main>

      {/* UPLOAD MODAL */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden relative max-h-[90vh] overflow-y-auto">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 sticky top-0">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <Upload className="w-5 h-5 text-blue-600" />
                Add Repository
              </h2>
              <button 
                onClick={() => {
                  setIsUploadModalOpen(false)
                  setUploadStatus('')
                  setUploadProgress(0)
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              {/* ZIP Upload */}
              <div className="border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-xl p-8 text-center bg-slate-50 transition-colors cursor-pointer relative group mb-4">
                <input
                  type="file"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  accept=".zip"
                  onChange={handleFileChange}
                />
                <div className="flex flex-col items-center gap-3 text-slate-500 group-hover:text-blue-600 transition-colors">
                  <Upload className="w-8 h-8" />
                  <p className="font-medium text-sm">{repoFile ? repoFile.name : "Click or drag ZIP file here"}</p>
                </div>
              </div>

              <button
                onClick={handleUpload}
                disabled={!repoFile || uploadProgress > 0}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-xl transition-all shadow-sm disabled:opacity-50 text-sm mb-6"
              >
                Upload & Index ZIP
              </button>

              <div className="relative flex items-center py-2 mb-6">
                <div className="flex-grow border-t border-slate-200"></div>
                <span className="flex-shrink-0 mx-4 text-slate-400 text-xs font-semibold tracking-wider uppercase">OR</span>
                <div className="flex-grow border-t border-slate-200"></div>
              </div>

              {/* GitHub Upload */}
              <form onSubmit={handleGithubUpload} className="flex flex-col gap-3">
                <div className="relative flex items-center">
                  <Github className="absolute left-3 w-5 h-5 text-slate-400" />
                  <input
                    type="url"
                    value={githubUrl}
                    onChange={(e) => setGithubUrl(e.target.value)}
                    placeholder="https://github.com/user/repo"
                    className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-slate-900 focus:ring-2 focus:ring-slate-800 focus:border-transparent transition-all text-sm outline-none shadow-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!githubUrl || uploadProgress > 0}
                  className="w-full bg-slate-800 hover:bg-slate-900 text-white font-medium py-2.5 rounded-xl transition-all shadow-sm disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                >
                  <Github className="w-4 h-4" />
                  Fetch GitHub Repo
                </button>
              </form>

              {/* Progress & Status */}
              {uploadProgress > 0 && uploadProgress < 100 && (
                <div className="w-full bg-slate-100 rounded-full h-2 mt-6 overflow-hidden">
                  <div className="bg-blue-600 h-full rounded-full transition-all duration-300 ease-out" style={{ width: `${uploadProgress}%` }}></div>
                </div>
              )}

              {uploadStatus && (
                <div className="mt-4 p-3 bg-blue-50 text-blue-700 text-sm rounded-lg flex items-center gap-2">
                  {uploadProgress > 0 && uploadProgress < 100 && <Loader2 className="w-4 h-4 animate-spin" />}
                  {uploadStatus}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default App