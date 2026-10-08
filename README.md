# AI Gym Coach

An AI-powered personal fitness coach for people who want to get leaner, build muscle, and stay consistent.

This project is in the **foundation stage**. The website shell exists. Login, the database, and the AI coach are not connected yet.

## What you have now

- A Next.js app (the website/app framework)
- TypeScript (helps catch mistakes in the code)
- Tailwind CSS (the styling system)
- A home screen and empty pages for Today, Train, Nutrition, Progress, and Coach

## How to look at the app on your computer

In a terminal, from this project folder, run:

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

## Connecting Supabase (you do this in a file, not in chat)

The app is wired to read two values from a local file called `.env.local` (this file stays on your computer and is not uploaded to GitHub).

1. Open your Supabase project in the browser.
2. Find **Project URL** and the **publishable** key (sometimes labelled “anon” or “publishable”). Do **not** copy the secret key.
3. Open `.env.local` in this project and replace:
   - `PASTE_PROJECT_URL_HERE` with the Project URL
   - `PASTE_PUBLISHABLE_KEY_HERE` with the publishable key
4. Save the file, then stop and start `npm run dev` again.

Do not paste those values into Cursor chat.

## What’s next (not built yet)

- Sign in with Supabase
- Saving goals, workouts, and check-ins
- AI conversations and proactive coaching with OpenAI
- Deploying the live app on Vercel
