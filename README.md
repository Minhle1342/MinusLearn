# MinusLearn

MinusLearn is an English vocabulary learning website organized by topic. It is designed to help users add new words quickly and review them through multiple practice modes. The current project includes a React + Vite frontend and a lightweight Chrome extension that can send highlighted text into the AI bulk-add flow.

## Current features

- Topic-based vocabulary management with a dedicated sidebar for each topic.
- Manual word creation with word, phonetic, meaning, example sentence, and image support.
- AI-powered bulk import from a text block or word list.
- Automatic illustration generation for vocabulary entries when an image model is configured.
- Search support and switching between card view and flashcard view.
- Listening practice using Speech Synthesis, answer input, and mistake tracking for later review.
- Reading practice with fill-in-the-blank multiple-choice questions.
- Spaced repetition review with `Forgot`, `Hard`, `Good`, and `Easy` ratings.
- Study streak tracking based on review history.
- Topic syncing with the extension and URL-parameter support to open the AI modal with prefilled text.

## Tech stack

- React 18
- Vite 5
- Tailwind CSS
- Lucide React
- LocalStorage for browser-side learning data storage

## Project structure

```text
frontend/   Main web application
extension/  Chrome extension for sending clipped text to MinusLearn
.agent/     Design notes and UI direction documents
```

## Run locally

### 1. Install dependencies

```bash
cd frontend
npm install
```

### 2. Create the environment file

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
```

### 3. Start the dev server

```bash
npm run dev
```

By default, Vite runs at `http://localhost:5173`.

### 4. Build for production

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

- Learning data is currently stored in LocalStorage, and there is no backend account sync yet.
- The API key is read from frontend environment variables or saved in the user's local settings.
- `frontend/.env` is ignored to avoid committing sensitive data.

## Project status

The website currently builds successfully in a local environment and can be extended further in areas such as:

- Adding a backend and authentication for data sync
- Improving the AI workflow and error handling
- Expanding extension support to more domains
