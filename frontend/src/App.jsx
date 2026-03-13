import { useState } from 'react'
import { Upload, Search, Code, Loader2 } from 'lucide-react'
import axios from 'axios'
import './App.css'

function App() {
  const [repoFile, setRepoFile] = useState(null)
  const [repoId, setRepoId] = useState(localStorage.getItem('repoId') || '')
  const [uploadStatus, setUploadStatus] = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [retrievedContext, setRetrievedContext] = useState([])

  const API_URL = "http://localhost:8000"

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
        const uploadRes = await axios.post(`${API_URL}/upload-repo`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: (progressEvent) => {
                const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total)
                setUploadProgress(percentCompleted)
            }
        })
        
        const newRepoId = uploadRes.data.repo_id
        setRepoId(newRepoId)
        localStorage.setItem('repoId', newRepoId)
        
        setUploadStatus('Extracting & indexing code... (this may take a minute)')
        
        // 2. Trigger Indexing
        await axios.post(`${API_URL}/index-code?repo_id=${newRepoId}`)
        
        setUploadStatus('Indexing started in the background. You can start asking questions!')
    } catch (error) {
        setUploadStatus(`Error: ${error.response?.data?.detail || error.message}`)
        setUploadProgress(0)
    }
  }

  const handleAskQuestion = async (e) => {
    e.preventDefault()
    
    if (!question.trim()) return
    if (!repoId) {
        setAnswer('Please upload a repository first before asking questions.')
        return
    }

    setIsLoading(true)
    setAnswer('Searching codebase and generating response... ⏳')
    setRetrievedContext([])

    try {
        const res = await axios.post(`${API_URL}/ask`, {
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
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 flex flex-col lg:flex-row gap-8">
        
        {/* Left Column: Upload */}
        <section className="w-full lg:w-1/3 flex flex-col gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 transition-all hover:shadow-md">
            <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Upload className="w-5 h-5 text-blue-500" />
              1. Upload Repository
            </h2>
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:bg-slate-50 transition-colors cursor-pointer relative group">
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
            
            {uploadProgress > 0 && uploadProgress < 100 && (
                <div className="w-full bg-slate-200 rounded-full h-2.5 mt-4">
                  <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${uploadProgress}%` }}></div>
                </div>
            )}
            
            <button 
               onClick={handleUpload}
               disabled={!repoFile || uploadProgress > 0}
               className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-xl transition-all active:scale-[0.98] shadow-sm disabled:opacity-50"
            >
              Upload & Index Code
            </button>
            {uploadStatus && <p className="mt-3 text-sm text-center text-slate-600 font-medium">{uploadStatus}</p>}
            {repoId && <p className="mt-1 text-xs text-center text-green-600 font-medium font-mono truncate">Active Repo ID: {repoId}</p>}
          </div>
        </section>

        {/* Right Column: Q&A */}
        <section className="w-full lg:w-2/3 flex flex-col gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex-1 flex flex-col transition-all hover:shadow-md">
            <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Search className="w-5 h-5 text-indigo-500" />
              2. Ask Questions
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
