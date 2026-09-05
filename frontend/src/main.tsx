import React from 'react'
import ReactDOM from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import App from './components/App'
import './styles/App.css'

const googleClientId = (import.meta.env as any).VITE_GOOGLE_CLIENT_ID || '';

// Suppress Google initialization warnings
if (typeof window !== 'undefined') {
  (window as any).gsap = { registerPlugin: () => {} };
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={googleClientId}>
      <App />
    </GoogleOAuthProvider>
  </React.StrictMode>,
)