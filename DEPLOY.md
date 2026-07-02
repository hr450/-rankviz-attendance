# Deploying RankViz Attendance to Vercel

This is a standard Vite + React app. Vercel auto-detects Vite projects, so there's
no config needed — just get the code onto Vercel.

## Option A — GitHub (recommended, gives you auto-deploys on every push)

1. Create a new empty repo on GitHub.
2. From this project folder:
   ```
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
3. Go to https://vercel.com/new, sign in (free), click **Import** next to your repo.
4. Vercel will detect "Vite" automatically — Build Command `vite build`,
   Output Directory `dist`. Just click **Deploy**.
5. You'll get a live `*.vercel.app` URL in about a minute. Every future
   `git push` auto-deploys.

## Option B — Vercel CLI (no GitHub needed, deploy straight from your machine)

1. Install the CLI: `npm i -g vercel`
2. From this project folder: `vercel`
   (first time it'll ask you to log in / create an account — free)
3. Answer the prompts (defaults are fine — it auto-detects Vite).
4. For production URL: `vercel --prod`

## Notes

- **Supabase keys**: `SUPABASE_URL` and `SUPABASE_ANON_KEY` are hardcoded in
  `src/App.jsx`. The anon/publishable key is meant to be public — but make sure
  you have Row Level Security (RLS) policies on your `employees` and
  `attendance` tables in Supabase, or anyone with the URL can read/write all
  your data.
- **Plan**: Vercel's free Hobby plan is enough for this (it's a static site
  talking directly to Supabase — no serverless functions needed). Hobby is
  for non-commercial use only; if this becomes a paid product, upgrade to Pro.
- To test locally first: `npm install && npm run dev`
