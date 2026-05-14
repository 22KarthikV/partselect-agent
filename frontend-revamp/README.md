# PartSelect AI — Frontend (Revamp)

This is the deployed Next.js frontend for the PartSelect AI Agent case study.
It is live on Vercel and communicates with the FastAPI backend through the
Next.js route handlers under `app/api/`.

For full setup instructions, environment variable configuration, and backend
deployment details, see the root `README.md` in the repository root.

## Quick start (local dev)

```bash
cd frontend-revamp
npm install
BACKEND_URL=http://localhost:8000 npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Key environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BACKEND_URL` | URL of the running FastAPI server | `http://localhost:8000` |

Set `BACKEND_URL` in your Vercel project settings for production deployments.
