import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "@/app/App";
import "@/styles/globals.css";
import { GoogleOAuthProvider } from "@react-oauth/google";

// Pode colocar o seu Client ID no ficheiro .env do frontend como VITE_GOOGLE_CLIENT_ID
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "1053030810053-0s7tuee76cpm8a46bibv6449v3351q15.apps.googleusercontent.com";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <App />
    </GoogleOAuthProvider>
  </React.StrictMode>
);