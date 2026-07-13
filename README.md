# MinusLearn

MinusLearn is an English vocabulary learning website organized by topic. It is designed to help users add new words quickly and review them through multiple practice modes. The current project includes a React + Vite frontend and a lightweight Chrome extension that can send highlighted text into the AI bulk-add flow.

## Current features

- Topic-based vocabulary management with a dedicated sidebar for each topic.
- Manual word creation with word, phonetic, meaning, example sentence, and image support (with local caching for external images).
- AI-powered bulk import from a text block or word list.
- Automatic illustration generation for vocabulary entries when an image model is configured, securely saved to the backend.
- Search support and switching between card view and flashcard view.
- Listening practice using Speech Synthesis, answer input, and mistake tracking for later review.
- Reading practice with fill-in-the-blank multiple-choice questions, featuring interactive AI explanations from Gemini.
- Spaced repetition review with `Forgot`, `Hard`, `Good`, and `Easy` ratings.
- Study streak tracking based on review history.
- Topic syncing with the extension and URL-parameter support to open the AI modal with prefilled text.

## Tech stack

- React 18
- Vite 5
- Tailwind CSS
- Lucide React
- FastAPI (Python)
- MongoDB Atlas
- JWT authentication with HttpOnly refresh cookies

## Project structure

```text
frontend/   Main web application
backend/    FastAPI API, authentication, MongoDB persistence, backup, image caching, and migration
extension/  Chrome extension for sending clipped text to MinusLearn
.agent/     Design notes and UI direction documents
```

## Run locally

### 1. Configure MongoDB Atlas

Create an Atlas database user with access to one database and copy its connection string. Create `backend/.env` from `backend/.env.example`:

```env
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>/minuslearn?retryWrites=true&w=majority
MONGODB_DB=minuslearn
JWT_SECRET=<long-random-secret>
CORS_ORIGINS=http://localhost:5173
COOKIE_SECURE=false
```

For production, use HTTPS, set `COOKIE_SECURE=true`, restrict `CORS_ORIGINS`, and keep all secrets outside version control.

### 2. Install and run the backend

```powershell
py -m venv backend\.venv
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
Copy-Item backend\.env.example backend\.env
cd backend
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

FastAPI health and API documentation are available at `http://localhost:8000/api/health` and `http://localhost:8000/docs`.

### 3. Install frontend dependencies

```bash
cd frontend
npm install
```

### 4. Create the frontend environment file

Copy the example file:

```bash
cp .env.example .env
```

Or on Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Current environment variables:

```env
VITE_GEMINI_DEFAULT_KEY=
VITE_GEMINI_DEFAULT_MODEL=gemini-3.1-flash-lite-preview
VITE_API_BASE_URL=http://localhost:8000
```

### 5. Start the dev server

```bash
npm run dev
```

By default, Vite runs at `http://localhost:5173`.

### 6. Build for production

```bash
npm run build
```

## How to use the website

1. Create a new topic from the sidebar.
2. Add vocabulary manually or open the AI tab to paste a word list or text block.
3. Configure your API key in Settings if you want to use AI features.
4. Switch between `Vocabulary`, `Listening`, `Reading`, and `Review` tabs to study.
5. Track mistakes and review progress directly inside the app.

## Chrome extension

The `extension/` folder contains a simple extension for sending highlighted text into MinusLearn.

- Extension name: `MinusLearn Clipper`
- Purpose: highlight text and send it into the AI bulk-add modal
- Current scope: the content script matches `http://localhost:5173/*`

To install it manually in Chrome:

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select the `extension` folder

## Current notes

- Learning data is stored in MongoDB and scoped to the authenticated account.
- AI/image API keys remain device-local and are never included in MongoDB backup or migration payloads.
- Settings → Data can export/restore a cloud backup and manually import a version 1 LocalStorage backup into an empty account.
- `frontend/.env` is ignored to avoid committing sensitive data.

## Tests

```powershell
backend\.venv\Scripts\python.exe -m pytest backend
cd frontend
npm run test:writing-visuals
npm run test:exam-writing
npm run build
```
