# Repliq

> Real-time bidirectional communication intelligence for Gmail.

Repliq is a Chrome extension that decodes the tone and subtext of emails you receive, and flags ambiguous phrasing in messages you are about to send - privately, simultaneously, in real time.

Built for the **Claude Hackathon 2026** by **Team Daemons** - Prarthan Patel and Sakshi Sheth.

---

## The Story Behind Repliq

We made a short video walking through how the idea of Repliq came to life - what problem we kept running into, why existing tools weren't solving it, and how we arrived at the bidirectional communication bridge concept.

[Watch the ideation video on YouTube](https://youtu.be/2MS6-73UQHw)

Made with the help of NotebookLM.

---

## What It Does

**For the receiver** - when you open an email, Repliq shows you the tone behind the words, 2-3 possible interpretations ranked by likelihood, and an optional suggested reply if the message is ambiguous.

**For the sender** - while composing, Repliq monitors your draft and flags vague time references, softening language that buries your actual request, and implied urgency. One click replaces your draft with a clearer version.

Both sides work privately and independently. The sender never sees the receiver's panel. The receiver never sees the sender's hints.

---

## Tech Stack

| Layer | Technologies |
|---|---|
| Extension | Manifest V3, Vanilla JS, Chrome Side Panel API |
| Backend | Node.js, Express, TypeScript, Grok API (xAI) |
| Web App | React + Vite, Firebase Auth, Firestore |
| Infrastructure | Railway (backend), Vercel (web app) |

---

## Project Structure

```
repliq/
├── extension/
│   ├── manifest.json
│   ├── content.js          # Gmail DOM reading + compose monitoring
│   ├── background.js       # Service worker + API routing
│   ├── panel/              # Chrome Side Panel UI
│   └── shared/
│       └── BridgeState.js  # Dismiss/accept session state
├── backend/
│   ├── routes/
│   │   ├── analyze.ts      # POST /analyze - Grok AI call
│   │   └── preferences.ts  # GET /preferences
│   └── lib/
│       ├── grok.ts
│       └── prompt.ts
├── web-app/
│   └── src/
│       ├── firebase/
│       └── pages/          # Login, Signup, Profile
└── shared/
    └── types.ts
```

---

## Getting Started

### Prerequisites
- Node.js 20+
- Grok API key from [console.x.ai](https://console.x.ai)
- Firebase project with Auth and Firestore enabled
- Chrome 114+

### 1. Clone the repo

```bash
git clone https://github.com/your-username/repliq.git
cd repliq
```

### 2. Backend setup

```bash
cd backend && npm install
```

Create `backend/.env`:

```env
GROK_API_KEY=your_grok_api_key
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_CLIENT_EMAIL=your_client_email
FIREBASE_PRIVATE_KEY="your_private_key"
PORT=3000
```

```bash
npm run dev   # runs at http://localhost:3000
```

### 3. Web app setup

```bash
cd web-app && npm install
```

Create `web-app/.env`:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_BACKEND_URL=http://localhost:3000
VITE_EXTENSION_ID=your_extension_id
```

```bash
npm run dev   # runs at http://localhost:5173
```

### 4. Load the extension

1. Go to `chrome://extensions` → enable **Developer mode**
2. Click **Load unpacked** → select the `extension/` folder
3. Copy the Extension ID into `web-app/.env` as `VITE_EXTENSION_ID`
4. Update `BACKEND_URL` at the top of `extension/background.js` if needed

### 5. Sign up and test

Go to `http://localhost:5173/signup`, create an account, complete preferences. Open Gmail - click any email to see the decode panel, then click Reply and type something vague to trigger a compose hint.

---

## API

### `POST /analyze`

```json
{
  "current_message": { "sender": "Sarah", "text": "That's fine." },
  "history": [],
  "user_preferences": { "receiving": [], "sending": [], "ambiguous": [] },
  "mode": "decode",
  "trigger_id": "abc123"
}
```

Returns `tone_flag`, `tone_summary`, `explanation`, `possible_meanings`, `suggested_reply`, `compose_rewrite`, and `flag_reason`.

### `GET /preferences`

Requires `Authorization: Bearer <firebase_id_token>`. Returns the user's preference set.

---

## Privacy

- No medical data, diagnostic labels, or clinical identifiers are stored at any point.
- Message content is processed in memory and discarded immediately - nothing is persisted.
- Each user's analysis is completely private. Neither side sees the other's output.
- GDPR compliant - export or delete all data from the profile page.

---

## Future Scope

- **Rephrasing and tone setting** - let users choose a target tone (formal, warm, direct) and have Repliq rephrase their draft accordingly, beyond just flagging ambiguity.
- **Interactive tone validation** - a mode where the user guesses the tone of a received message before seeing the analysis, building communication awareness over time.
- **Grammar and spell check** - integrate lightweight grammar and spelling correction alongside tone analysis so Repliq covers clarity at every level.
- **Deeper NLP and sarcasm detection** - improve context parsing and sentiment analysis to understand sarcasm, irony, and hidden meaning that surface-level tone classification misses.

---

## Live Demo

See Repliq in action. This demo walks through how Repliq analyzes an incoming email and suggests a calmer, clearer reply — so your words land the way you actually intended.

[Watch the demo on YouTube](https://www.youtube.com/watch?v=Ad0T6H7zwZ8)

---

## Team

**Team Daemons** - Claude Hackathon 2026

Sakshi Sheth · Prarthan Patel
