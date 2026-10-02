# Aura AI

<p align="center">
  <strong>AI-powered claim verification and research workspace</strong>
</p>

<p align="center">
  Aura AI combines LLM reasoning, web search, source analysis, URL extraction, OCR, and a conversational React interface to help users investigate claims and research information.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=111827" alt="React 18" />
  <img src="https://img.shields.io/badge/Vite-Frontend-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Node.js-Backend-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Express-API-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express" />
  <img src="https://img.shields.io/badge/MongoDB-Database-47A248?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB" />
</p>

---

## 📌 Table of Contents
- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Author](#author)

---

## 🚀 Overview
**Aura AI** is a full-stack AI research and claim-verification application. Instead of sending a user's message directly to an LLM and displaying the generated answer, Aura AI breaks the problem into multiple stages:

1. Understand the user's input.
2. Extract the important claim(s).
3. Generate targeted search queries.
4. Retrieve external evidence.
5. Evaluate the quality and credibility of sources.
6. Compare the evidence with the claim.
7. Ask an LLM to produce structured reasoning.
8. Present the result through a conversational research interface.

## ✨ Features
* **AI-powered claim verification:** Returns structured verification results containing verdicts, confidence scores, key facts, and trusted/suspicious sources.
* **Research, verify, and mixed modes:** Supports dedicated workflows for binary claim verification or broader research.
* **URL analysis:** Users can submit a URL to have the backend fetch, extract, and analyze the accessible page content.
* **Image and screenshot analysis:** Uses OCR to extract text from social-media screenshots and images before running the analysis workflow.
* **Source credibility analysis:** Evaluates search results to separate useful sources from those requiring additional caution before final reasoning.
* **Conversational research workspace:** Features persistent conversations, source lists, profile settings, and local browser state management.
* **Secure Authentication:** Express backend supports Google OAuth, email/password login, JWTs, and bcrypt password hashing.

## 🏗️ Architecture
The application uses a **MERN-oriented full-stack architecture**:
* **Frontend:** React 18, Vite, Framer Motion, and custom CSS for a responsive, accessible chat interface.
* **Backend:** Node.js and Express REST API handling HTTP routing, validation, and authentication.
* **Database:** MongoDB for storing user profiles, analysis history, and support requests.
* **AI & External Services:** Groq/Gemini for LLM inference, Tavily for web search, and Tesseract.js for OCR.

## 🧰 Tech Stack
* **Frontend:** React 18, Vite, JavaScript / JSX, Framer Motion, CSS Grid / Flexbox.
* **Backend:** Node.js, Express, MongoDB, Mongoose, JWT, bcrypt, Helmet, Express Rate Limit.
* **AI / Research:** Groq, Google Gemini, Tavily Web Search, Tesseract.js.


