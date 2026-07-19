# ilink App Prototype

Interactive, responsive prototype for the ilink app and smart-glasses concept.

## InsForge backend

The prototype now uses InsForge for:

- email/password authentication and email verification
- private life-entry persistence
- outbound family-card persistence
- row-level security so users can only access their own records

Copy `.env.example` to `.env.local` and provide the project URL and public anon key before running locally.

## Preview locally

```bash
npm install
npm run dev
```

## Hosting

The site is built with Vite and published from the generated `docs/` directory through GitHub Pages.
