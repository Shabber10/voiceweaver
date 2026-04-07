# SpeakWeaver | Premium Zero-Latency TTS

SpeakWeaver is a high-fidelity, multilingual text-to-speech application with built-in OCR and immersive zoom inspection.

## 🚀 Quick Start
1.  **Install Node.js** (if you don't have it).
2.  Open a terminal in the `voiceweaver` folder.
3.  Run:
    ```bash
    npm install
    ```
4.  Start the server:
    ```bash
    node backend/server.js
    ```
5.  Open your browser to: `http://localhost:3000`

## ✨ Features
*   **Zero-Latency Playback**: Speculative background audio generation as you type or scan.
*   **Multilingual Support**: High-quality Neural voices for English, Hindi, and Telugu.
*   **Box-less OCR Mode**: Immersive image viewing with custom Zoom & Pan engine.
*   **Word Highlighting**: Real-time canvas overlays synced with OCR text.
*   **Premium UI**: Glassmorphism dashboard with smooth percentage loading.

## 🛠️ Tech Stack
*   **Frontend**: Vanilla HTML/CSS/JS + Tesseract.js (OCR).
*   **Backend**: Node.js + Express.
*   **TTS**: Microsoft Edge Neural TTS.

## 🌐 Deployment
This project is built as a split-stack for easiest free hosting:
*   **Frontend**: Hosted on [Netlify](https://netlify.com/)
*   **Backend**: Hosted on [Render](https://render.com/)

**To deploy your own:**
1. Push this repository to GitHub.
2. Sign up on **Render**, create a new Web Service tied to the GitHub repo. Render will automatically use the `start` script to run the backend. Grab your Render URL (e.g. `https://voiceweaver-backend.onrender.com`).
3. Update the `API_BASE` variable in `frontend/app.js` to use your Render URL.
4. Sign up on **Netlify**, link your GitHub repo, and deploy! The `netlify.toml` file takes care of the settings.

---
Built by Shabber and Antigravity.
