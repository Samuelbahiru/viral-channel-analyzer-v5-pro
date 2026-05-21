# ViralScope Creator Intelligence Pro v5.0

React + Express + Prisma + PostgreSQL tool for researching newly growing YouTube channels, saving competitors, building niche reports, analyzing channels deeply, generating content ideas, and planning monetization.

## What this version adds

- Multi-section creator workspace UI
- Dashboard with KPI cards and visual summaries
- Research page with Shorts / videos filtering
- Watchlist with refreshable saved channels
- Deep competitor channel analysis
- Trend detection from saved reports and snapshots
- Content idea generator
- Monetization intelligence reports
- Saved scan plans for daily research routines
- History and search logs

## Setup

### 1. Start PostgreSQL

```bash
docker compose up -d
```

### 2. Backend

```bash
cd backend
cp .env.example .env
npm install
npx prisma db push
npx prisma generate
npm run dev
```

Edit `backend/.env` and add your YouTube Data API key:

```env
YOUTUBE_API_KEY="YOUR_KEY_HERE"
```

### 3. Frontend

Open another terminal:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Open the Vite URL, usually:

```txt
http://localhost:5173
```

## Upgrade from v4.1

Copy your existing `backend/.env` into this new backend folder, then run:

```bash
cd backend
npm install
npx prisma db push
npx prisma generate
npm run dev
```

Do not run `docker compose down -v` unless you want to delete your local PostgreSQL data.

## New Prisma tables in v5

- `deep_channel_analyses`
- `content_idea_sets`
- `monetization_reports`
- `scheduled_scans`

## Notes

YouTube does not provide a perfect "viral new channels" endpoint. This tool infers opportunity by combining search results, public video/channel stats, channel age, format classification, views per subscriber, opportunity scoring, saved snapshots, and repeated reports.

For local development, Docker PostgreSQL is mapped to port `5433` to avoid conflicts with a local PostgreSQL install.
