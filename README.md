# Aura AI

<p align="center">
  <strong>AI-powered claim verification and research workspace</strong>
</p>

<p align="center">
  Investigate claims with AI-assisted analysis, web search, source credibility checks, URL extraction, and OCR.
</p>

<p align="center">
  <a href="https://aura-ai-fake-news-detector.vercel.app/"><strong>🚀 View the live app</strong></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=111827" alt="React 18" />
  <img src="https://img.shields.io/badge/Vite-Frontend-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Node.js-Backend-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Express-API-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express" />
  <img src="https://img.shields.io/badge/MongoDB-Database-47A248?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB" />
</p>

---

## Overview

Aura AI is a full-stack AI research and claim-verification application. It combines language-model reasoning with web evidence so users can explore a claim through a conversational research interface.

## Features

- **Claim verification:** Structured results with verdicts, confidence, key facts, and sources.
- **Research modes:** Verify, research, and mixed workflows.
- **URL analysis:** Extracts and analyzes content from submitted web pages.
- **Image analysis:** OCR extracts text from screenshots and images for analysis.
- **Source credibility:** Assesses retrieved sources to help users evaluate evidence.
- **Authentication:** Google OAuth and email/password sign-in, with JWT-based sessions.
- **Research workspace:** Source lists, profiles, and analysis history for signed-in users.

## Architecture

- **Frontend:** React 18, Vite, Framer Motion, and responsive CSS.
- **Backend:** Node.js, Express, and REST API.
- **Database:** MongoDB with Mongoose.
- **AI and research:** Groq or Gemini for language-model inference, Tavily for web search, and Tesseract.js for OCR.
- **Deployment:** Vercel frontend and serverless API.

## Tech Stack

React · Vite · Node.js · Express · MongoDB · Mongoose · Groq/Gemini · Tavily · Tesseract.js

## Run Locally

Install dependencies for the root project, backend, and frontend:

```bash
npm run install:all
```

Create `backend/.env` with the required backend configuration, then start both apps:

```bash
npm run dev
```

The frontend runs locally on Vite and uses `http://localhost:5000` for the API by default. Set `VITE_API_URL` in the frontend environment to use a different API URL.

## Production Configuration

Configure these environment variables in the deployment environment:

- `MONGODB_URI`
- `JWT_SECRET`
- `GROQ_API_KEY` or `GEMINI_API_KEY`
- `TAVILY_API_KEY`
- `CORS_ORIGINS` for any custom frontend origins
- `GOOGLE_CLIENT_ID` if Google sign-in is enabled

The production frontend uses the same-origin `/api` endpoint by default. Set `VITE_API_URL` if the API is hosted separately.
