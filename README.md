# CampusVault — Registrar ERP

A full-stack student registrar web app: Dashboard, Students Directory, and Security & Backup —
backed by a real SQLite database, built with **zero external dependencies** (pure Node.js).

## Requirements
- Node.js **v22.5+** (uses Node's built-in `node:sqlite` module)

## Run it

```bash
cd campusvault
npm start
```

Then open **http://localhost:3000** in your browser.

That's it — no `npm install` needed. The database file is created automatically at
`data/campusvault.db` on first run, seeded with 180 sample students across 7 departments.

## What's inside

- **Dashboard** — live stats (total students, departments, average CGPA/attendance),
  department distribution bars, and recently added students — all computed live from the database.
- **Students Directory** — search by name/roll/email, filter by department/year/section/status,
  add/edit/delete students, with pagination.
- **Security & Backup** — create JSON snapshots of the student table, view backup history,
  restore from a snapshot, and a live audit trail of every action (create/edit/delete/backup/restore),
  all protected by a 4-digit security PIN (default: **1234**).

## Project structure

```
campusvault/
├── server.js        # HTTP server + REST API (no framework, uses node:http)
├── db.js            # SQLite schema, seed data, and query helpers
├── package.json
├── public/           # Frontend (vanilla HTML/CSS/JS, no build step)
│   ├── index.html
│   ├── style.css
│   └── app.js
└── data/             # Created at runtime: database file + backup snapshots
```

## Changing the security PIN

The PIN is stored in the `settings` table. To change it, stop the server and run:

```bash
node -e "
const { db } = require('./db');
db.prepare('UPDATE settings SET value = ? WHERE key = ?').run('YOUR_NEW_PIN', 'backup_pin');
console.log('PIN updated');
"
```

## Deploying it online (free public link)

This app is a plain Node.js server (no external dependencies), which makes it a good fit for
**[Render](https://render.com)**'s free web service tier.

### Steps

1. **Put the code on GitHub.**
   - Create a free GitHub account if you don't have one.
   - Create a new repository (e.g. `campusvault`).
   - Upload this whole folder to it — on the repo page, use **Add file → Upload files** and
     drag everything in, or use `git push` if you're comfortable with git.

2. **Create a free Render account** at render.com and sign in with GitHub.

3. **New → Web Service**, then pick your `campusvault` repository. Render will detect the
   included `render.yaml` and pre-fill everything:
   - Build command: `npm install`
   - Start command: `npm start`
   - Node version: pinned via `.node-version` (22.22.2)

   If it doesn't auto-detect, enter those two commands manually.

4. Click **Deploy**. After the build finishes (1–2 minutes), Render gives you a public URL like
   `https://campusvault-xxxx.onrender.com` — that's your live site.

### Important limitation on the free tier

Render's free web services **sleep after 15 minutes of inactivity** and **don't include persistent
disk storage**. That means:
- The first visit after it's been idle takes ~30–60 seconds to "wake up" — normal, not a bug.
- Any students you add, edit, or delete — and any backups you create — **reset back to the
  seeded 180 students** the next time it wakes from sleep.

For showing off the project (portfolio, a professor, a demo link), this is usually fine. If you
want data to actually persist permanently, upgrade that one service to the **Starter plan
($7/month)** and add a **persistent disk** (a couple cents/month for a database this small) mounted
at `/opt/render/project/src/data` — Render's dashboard has an "Add Disk" option once you're on a
paid plan.

## Notes

- This is a demo/college-project build. The "PIN" and "vault" language is styled after an
  institutional ERP look, but this app does not implement real encryption-at-rest — treat it
  as a learning project, not production security software.
- All data lives in a single local SQLite file — back it up externally (e.g. copy `data/campusvault.db`)
  if you want an extra safety net beyond the in-app backup feature.
