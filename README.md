# VLC Curriculum Tool — Disciple to Discipleship

Facilitator-facing curriculum reference and feedback tool for the 12-month
Disciple to Discipleship program at Verity Learning Center.

## Stack
- React 18 + Vite
- Supabase (data persistence, facilitator profiles, RLS)
- Notion (shared feedback log — `d90b58836a1e49f5ba51f6bc8969b412`)
- Resend (admin email alerts on Edit Requests)
- Deployed via Vercel

---

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Copy env template and fill in your values
cp .env.example .env.local
# Edit .env.local — never commit this file

# 3. Start dev server
npm run dev
# Opens at http://localhost:5173
```

---

## Deploy to Vercel (first time)

1. Push this repo to GitHub
2. Go to vercel.com → New Project → Import your GitHub repo
3. Vercel auto-detects Vite — no framework config needed
4. Under **Environment Variables**, add each variable from `.env.example`:

| Variable | Where to get it |
|---|---|
| `VITE_SUPABASE_URL` | Already set — `https://mpswxsbczxmdvfjidbqq.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon/public key |
| `VITE_ADMIN_PIN` | Choose your own PIN |
| `VITE_ADMIN_EMAIL` | Your email for Edit Request alerts |
| `VITE_RESEND_KEY` | resend.com → API Keys (after verifying your domain) |
| `VITE_NOTION_TOKEN` | Notion → Settings → Connections → your integration secret |

5. Click **Deploy** — Vercel builds and gives you a live URL

### Future deploys
Push to `main` → Vercel auto-deploys. No manual steps.

---

## Embedding in VLC

### Option A — Link in VLC navigation
Add the deployed Vercel URL as a menu item or course link in VLC.
Simplest option, works immediately.

### Option B — iframe embed in a VLC page
```jsx
// In your VLC React app
<iframe
  src="https://your-curriculum-tool.vercel.app"
  style={{ width: '100%', height: '100vh', border: 'none' }}
  title="Curriculum Tool"
/>
```
Update `vercel.json` → replace `your-vlc-domain.vercel.app` with your
actual VLC Vercel URL so the iframe embedding is allowed.

---

## Supabase Tables

### `curriculum_edits`
Stores all facilitator feedback, comments, and edit requests.
- Linked to `profiles.id` via `fac_id`
- RLS: authenticated users read all, insert own; admin role updates status

### `curriculum_facilitators` (VIEW)
Auto-populates facilitator roster from `profiles` where
`role IN ('instructor','admin') AND active = true`.
To add a facilitator: add them as a profile in Supabase with `role = 'instructor'`.

---

## Notion Feedback Log

Database: https://www.notion.so/d90b58836a1e49f5ba51f6bc8969b412

Views:
- **Table** (default) — all entries
- **By Status** — board grouped by pending / approved / rejected
- **Needs Review** — filtered to pending, sorted by date

Entries are pushed automatically when a facilitator submits feedback,
provided `VITE_NOTION_TOKEN` is set.

---

## Resend Setup

1. Sign up at resend.com
2. Add and verify your sending domain (e.g. `veritylearning.com`)
3. Create an API key → paste as `VITE_RESEND_KEY` in Vercel
4. Set `VITE_ADMIN_EMAIL` to where you want alerts sent
5. Edit Requests will trigger an email immediately on submission
