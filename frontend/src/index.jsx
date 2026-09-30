import React from "react";
import ReactDOM from "react-dom/client";
import { GoogleOAuthProvider } from "@react-oauth/google";

import App from "./components/App";
import "./styles/App.css";

const rootElement = document.getElementById("root");
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();

if (!rootElement) {
  throw new Error("Root element was not found.");
}

const app = googleClientId ? (
  <GoogleOAuthProvider clientId={googleClientId}>
    <App />
  </GoogleOAuthProvider>
) : (
  <App />
);

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    {app}
  </React.StrictMode>
);