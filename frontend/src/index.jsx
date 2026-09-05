import React from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './components/App';
import './styles/App.css';

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

const Root = (
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if (googleClientId) {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <GoogleOAuthProvider clientId={googleClientId}>
        <App />
      </GoogleOAuthProvider>
    </React.StrictMode>,
  );
} else {
  ReactDOM.createRoot(document.getElementById('root')).render(Root);
}
