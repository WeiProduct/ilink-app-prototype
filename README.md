# ilink Web App

Responsive, installable Web App for private life capture, transcription, review, and family sharing.

## InsForge backend

The app uses InsForge for:

- email/password authentication and email verification
- private life-entry persistence, editing, confirmation, and deletion
- private recording storage and authenticated playback
- outbound family-card persistence and deletion
- row-level security so users can only access their own records
- authenticated edge functions for OpenAI speech-to-text
- an authenticated OpenAI product assistant presented as the “小连” electronic pet

The OpenAI key is stored only as an InsForge server secret and is never shipped to the browser.
The assistant answers product questions but cannot read a user's private records. Family delivery,
hardware pairing, and smart-glasses capture remain clearly labeled product previews.

Copy `.env.example` to `.env.local` and provide the project URL and public anon key before running locally.

## Preview locally

```bash
npm install
npm run dev
```

## Hosting

The site is built with Vite and published from the generated `docs/` directory through GitHub Pages.
It includes a Web App Manifest and service worker for home-screen installation and offline shell loading.
