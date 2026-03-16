import { useState, useEffect, useMemo } from 'react'
import { Upload, Search, Code, Loader2, Github, Trash2, LogOut, User } from 'lucide-react'
import axios from 'axios'
import { useAuth } from './AuthProvider'
import AuthPage from './AuthPage'
import './App.css'

function App() {
  const { session, user, loading, signOut } = useAuth()

  const [repoFile, setRepoFile] = useState(null)
  const [githubUrl, setGithubUrl] = useState('')
  const [repoId, setRepoId] = useState(localStorage.getItem('repoId') || '')
  const [repoName, setRepoName] = useState(localStorage.getItem('repoName') || '')
  const [uploadStatus, setUploadStatus] = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [retrievedContext, setRetrievedContext] = useState([])
  const [repos, setRepos] = useState([])

  const API_URL = "http://localhost:8000"

  // Authenticated axios instance — automatically attaches JWT
  const api = useMemo(() => {
    const instance = axios.create({ baseURL: API_URL })
    instance.interceptors.request.use((config) => {
      const token = session?.access_token
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
      return config
    })
    return instance
  }, [session])

  // Fetch all repos on mount & when session changes
  useEffect(() => {
    if (session) {
      fetchRepos()
    }
  }, [session])

  const fetchRepos = async () => {
    try {
      const res = await api.get('/repos')
      console.log('Repos response:', res.data)
      const repoList = res.data.repos || res.data || []
      console.log('Repo list:', repoList)
      setRepos(Array.isArray(repoList) ? repoList : [])
    } catch (error) {
      console.error('Failed to fetch repos:', error)
    }
  }

  const selectRepo = (repo) => {
    setRepoId(repo.id)
    setRepoName(repo.name)
    localStorage.setItem('repoId', repo.id)
    localStorage.setItem('repoName', repo.name)
    setAnswer('')
    setRetrievedContext([])
    setUploadStatus(`Switched to: ${repo.name}`)
  }

  const handleDeleteRepo = async (repoIdToDelete, repoNameToDelete) => {
    if (!window.confirm(`Are you sure you want to delete "${repoNameToDelete}"? This will remove all indexed data.`)) return

    try {
      await api.delete(`/repos/${repoIdToDelete}`)
      
      // If we deleted the active repo, clear it
      if (repoIdToDelete === repoId) {
        setRepoId('')
        setRepoName('')
        localStorage.removeItem('repoId')
        localStorage.removeItem('repoName')
        setAnswer('')
        setRetrievedContext([])
      }
      
      setUploadStatus(`Deleted: ${repoNameToDelete}`)
      fetchRepos() // Refresh list
    } catch (error) {
      setUploadStatus(`Error deleting repo: ${error.response?.data?.detail || error.message}`)
    }
  }

  const handleClearActiveRepo = () => {
    setRepoId('')
    setRepoName('')
    localStorage.removeItem('repoId')
    localStorage.removeItem('repoName')
    setAnswer('')
    setRetrievedContext([])
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
    if (!repoFile) {
        setUploadStatus('Please select a ZIP file first.')
        return
    }

    setUploadStatus('Uploading repository...')
    const formData = new FormData()
    formData.append('file', repoFile)

    try {
        // 1. Upload ZIP
        const uploadRes = await api.post('/upload-repo', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: (progressEvent) => {
                const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total)
                setUploadProgress(percentCompleted)
            }
        })
        
        const newRepoId = uploadRes.data.repo_id
        const newRepoName = uploadRes.data.repo_name || repoFile.name
        setRepoId(newRepoId)
        setRepoName(newRepoName)
        localStorage.setItem('repoId', newRepoId)
        localStorage.setItem('repoName', newRepoName)
        
        setUploadStatus('Extracting & indexing code... (this may take a minute)')
        
        // 2. Trigger Indexing
        await api.post(`/index-code?repo_id=${newRepoId}`)
        
        setUploadStatus('Indexing started in the background. You can start asking questions!')
        fetchRepos() // Refresh list
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
        const uploadRes = await api.post('/upload-github-repo', {
            url: githubUrl
        })
        
        const newRepoId = uploadRes.data.repo_id
        const newRepoName = uploadRes.data.repo_name || githubUrl.split('/').pop()
        setRepoId(newRepoId)
        setRepoName(newRepoName)
        localStorage.setItem('repoId', newRepoId)
        localStorage.setItem('repoName', newRepoName)
        
        setUploadStatus('Indexing code from GitHub... (this may take a minute)')
        
        await api.post(`/index-code?repo_id=${newRepoId}`)
        
        setUploadStatus('Indexing started. You can start asking questions!')
        setGithubUrl('') // clear input
        fetchRepos() // Refresh list
    } catch (error) {
        setUploadStatus(`Error: ${error.response?.data?.detail || error.message}`)
    }
  }

  const handleAskQuestion = async (e) => {
    e.preventDefault()
    
    if (!question.trim()) return
    if (!repoId) {
        setAnswer('Please upload or select a repository first before asking questions.')
        return
    }

    setIsLoading(true)
    setAnswer('Searching codebase and generating response... ⏳')
    setRetrievedContext([])

    try {
        const res = await api.post('/ask', {
            question: question,
            repo_id: repoId
        })
        
        setAnswer(res.data.answer)
        setRetrievedContext(res.data.context || [])
    } catch (error) {
        setAnswer(`Error asking question: ${error.response?.data?.detail || error.message}`)
    } finally {
        setIsLoading(false)
        setQuestion('') // clear input
    }
  }

  const handleSignOut = async () => {
    await signOut()
    setRepos([])
    setRepoId('')
    setRepoName('')
    setAnswer('')
    setRetrievedContext([])
  }

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  // Show auth page if not logged in
  if (!session) {
    return <AuthPage />
  }
  
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

          {/* User Info + Logout */}
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
                  if (selected) {
                    selectRepo(selected)
                  } else {
                    handleClearActiveRepo()
                  }
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
            {/* ZIP Upload */}
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:bg-slate-50 transition-colors cursor-pointer relative group mb-4">
              <input 
                type="file" 
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                accept=".zip" 
                onChange={handleFileChange}
              />
              <div className="flex flex-col items-center gap-3 text-slate-500 group-hover:text-blue-600 transition-colors">
                <Upload className="w-8 h-8" />
                <p className="font-medium">
                   {repoFile ? repoFile.name : "Click or drag ZIP file here"}
                </p>
                <p className="text-xs">Max size: 50MB</p>
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

            {/* GitHub Upload */}
            <form onSubmit={handleGithubUpload} className="flex flex-col gap-3">
              <div className="relative flex items-center">
                <Github className="absolute left-3 w-5 h-5 text-slate-400" />
                <input 
                  type="url" 
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/user/repo" 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all shadow-inner text-sm"
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

        {/* Right Column: Q&A */}
        <section className="w-full lg:w-2/3 flex flex-col gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex-1 flex flex-col transition-all hover:shadow-md">
            <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Search className="w-5 h-5 text-indigo-500" />
              Ask Questions
              {repoName && <span className="text-sm font-normal text-slate-400 ml-auto">Querying: <span className="text-indigo-500 font-medium">{repoName}</span></span>}
            </h2>
            
            <div className="flex-1 min-h-[300px] border border-slate-200 rounded-xl bg-slate-50 mb-4 p-5 overflow-auto">
              {answer ? (
                 <div className="flex flex-col gap-6 w-full">
                     <div className="prose prose-slate max-w-none w-full bg-white p-4 rounded-lg border border-slate-100 shadow-sm">
                         <div className="whitespace-pre-wrap">{answer}</div>
                     </div>
                     
                     {retrievedContext.length > 0 && (
                         <div className="mt-4">
                             <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Retrieved Context</h3>
                             <div className="flex flex-col gap-3">
                                 {retrievedContext.map((ctx, idx) => (
                                     <div key={idx} className="bg-slate-800 rounded-lg overflow-hidden border border-slate-700">
                                         <div className="bg-slate-900 px-4 py-2 text-xs font-mono text-slate-300 border-b border-slate-700 flex justify-between">
                                             <span>{ctx.file_path}</span>
                                             <span className="text-slate-500">Match: {(ctx.similarity * 100).toFixed(1)}%</span>
                                         </div>
                                         <pre className="p-4 text-xs font-mono text-slate-300 overflow-x-auto m-0">
                                             <code>{ctx.content}</code>
                                         </pre>
                                     </div>
                                 ))}
                             </div>
                         </div>
                     )}
                 </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3">
                  <Search className="w-10 h-10 opacity-20" />
                  <p>Ask a question about the codebase to get an AI-generated explanation.</p>
                </div>
              )}
            </div>

            <form className="relative flex items-center" onSubmit={handleAskQuestion}>
              <input 
                type="text" 
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="How does the authentication flow work?" 
                className="w-full bg-slate-100 border-none rounded-xl py-4 pl-5 pr-14 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all shadow-inner"
                disabled={isLoading}
              />
              <button 
                type="submit" 
                className="absolute right-2 bg-blue-600 text-white p-2.5 rounded-lg hover:bg-blue-700 transition-colors active:scale-95 disabled:opacity-50"
                disabled={isLoading || !question.trim()}
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
              </button>
            </form>
          </div>
        </section>
        
      </main>
    </div>
  )
}

export default App
