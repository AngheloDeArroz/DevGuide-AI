import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The backend URL differs between local dev and Docker:
//   - Local:  http://localhost:8000  (direct connection)
//   - Docker: http://backend:8000    (Docker service name, set via docker-compose env)
const backendUrl = process.env.VITE_BACKEND_URL || 'http://localhost:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy API paths through Vite so the browser never needs to know the backend URL.
    // App.jsx uses baseURL: "" (relative), so all API calls hit this proxy.
    proxy: {
      '/upload-repo': backendUrl,
      '/upload-github-repo': backendUrl,
      '/index-code': backendUrl,
      '/repos': backendUrl,
      '/ask': backendUrl,
      '/conversations': backendUrl,
    },
  },
})
