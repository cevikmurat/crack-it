# 🔐 Crack It! — Deployment Guide

This guide takes you from the files on your computer to a **live web link** you can give to
any class — and share with other teachers — with a **live leaderboard that works across
every phone and laptop**. Multiple classes can run at the same time without interfering
with each other.

**No coding needed. Everything is done in your web browser.**
It takes about **15 minutes** the first time, and it's **completely free**.

---

## What you're setting up (the simple version)

Your game is a single web page, but a page on its own can't share data between different
phones. So we add two free pieces:

1. **Vercel** — free web hosting that puts your game online at a real link.
2. **A free database (Upstash Redis, via Vercel)** — the shared "notebook" where room codes
   and scores are stored so *everyone sees the same thing*.

You'll do it in this order: put the files on **GitHub** → connect **Vercel** → add the
**database** → test. Let's go.

---

## The files you have

Inside the `crack-it` folder there are three things. All three must go online exactly as they are:

```
crack-it/
├─ index.html        ← the game itself
├─ package.json      ← tells the server which database tool to install
└─ api/
   └─ store.js       ← the little "shared notebook" program
```

> ⚠️ Keep `store.js` **inside a folder named `api`**. That folder name is what turns it into
> a live mini-server. If it ends up loose in the main folder, the leaderboard won't work.

---

## STEP 1 — Put the files on GitHub (≈5 min)

GitHub is free online storage for project files. Vercel reads your game from here.

1. Go to **https://github.com** and click **Sign up** (skip if you already have an account).
   Verify your email and sign in.
2. At the top-right, click the **➕** → **New repository**.
3. Fill in:
   - **Repository name:** `crack-it`
   - Select **Public** (this is fine — none of your students' data lives here, only the game code).
   - Leave everything else unticked.
4. Click **Create repository**.

Now upload the game files:

5. On the new repository page, click the link **“uploading an existing file”**
   (or the **Add file** button → **Upload files**).
6. Drag **`index.html`** and **`package.json`** from your `crack-it` folder into the upload box.
7. Click the green **Commit changes** button.

Now add the `api/store.js` file (this creates the folder correctly):

8. Click **Add file** → **Create new file**.
9. In the filename box at the top, type exactly:  `api/store.js`
   *(Typing the `/` automatically creates the `api` folder.)*
10. Open `store.js` on your computer with any text editor (e.g. Notepad / TextEdit),
    select **all** the text, copy it, and paste it into the big editor box on GitHub.
11. Click **Commit changes**.

✅ Your repository should now show `index.html`, `package.json`, and an `api` folder.
Click into `api` to confirm `store.js` is inside it.

---

## STEP 2 — Put the game online with Vercel (≈4 min)

1. Go to **https://vercel.com** and click **Sign Up**.
2. Choose **Continue with GitHub** and approve — this links the two accounts so Vercel can
   see your `crack-it` files. Choose the **Hobby** (free, personal) plan if asked.
3. On your Vercel dashboard, click **Add New…** → **Project**.
4. Find **`crack-it`** in the list and click **Import**.
5. On the configure screen, **don't change anything.** (Framework Preset will say “Other” —
   that's correct.) Just click **Deploy**.
6. Wait about a minute for the 🎉 confirmation.

At this point the game *page* is live, but the leaderboard won't work yet — we haven't given
it the shared database. That's the next step. (If you open it now, a teacher and a student on
the same device can play, but different phones won't see each other. We fix that now.)

---

## STEP 3 — Add the free database (≈4 min)

1. Still in Vercel, open your **crack-it** project, then click the **Storage** tab near the top.
2. Click **Create Database** (or **Connect Database**). A list of database types appears.
3. Choose **Redis** — the provider will be **Upstash**. Click it, then **Continue**.
4. Pick the **Free** plan when prompted. (No credit card required.)
5. Give it any name (e.g. `crack-it-db`) and pick the region closest to you
   (for Türkiye, an EU region like Frankfurt is a good choice). Click **Create**.
6. When asked **which project to connect it to**, choose **crack-it** and confirm/**Connect**.

Connecting the database automatically hands your game the secret keys it needs (you don't have
to copy anything). ✨

---

## STEP 4 — Redeploy so the game picks up the database (≈2 min)

The game needs one fresh deploy *after* the database is connected.

1. In your project, click the **Deployments** tab.
2. Find the most recent deployment at the top, click the **•••** menu on its right,
   and choose **Redeploy**. Confirm **Redeploy** in the popup.
   *(If Vercel already started a new deployment on its own after you connected the database,
   just wait for it to finish — that counts.)*
3. Wait for the ✅.

---

## STEP 5 — Get your link and test it

1. In the project, click **Visit** (or **Domains**) to find your link. It looks like:
   **`https://crack-it-yourname.vercel.app`**
2. **Test the full flow — this is the important part:**
   - On your **laptop**, open the link → tap **I'm the teacher** → set a word (e.g. `GARDEN`),
     a clue (e.g. `flowers`), and start the round. You'll get a **4-letter room code**.
   - On your **phone** (using mobile data / a different network is the best test), open the
     **same link** → tap **I'm a student** → type the room code and your name → play.
   - When you finish on the phone, your name should appear on the **teacher's leaderboard**
     on the laptop within a few seconds. 🎉

If the student's name shows up on the teacher's screen, **everything works** and you're ready
for class.

---

## STEP 6 — Use it in class & share with friends

**For your class:** just give students the **link** and the **room code**. Tip: the teacher
screen has a **📋 Copy invite text** button that copies a ready-made message (link + code)
you can paste into your class group/WhatsApp/Google Classroom.

**Running several classes at once:** each round has its own room code, and codes keep all the
data separate — so you and three colleagues can all run different words at the same time on the
same link with zero setup. Nothing collides.

**Sharing with other teachers — two easy options:**

- **Simplest (recommended):** just send them the **same link**. Any teacher can open it, tap
  *I'm the teacher*, and create their own rooms. One deployment happily serves everyone.
- **They want their own copy:** send them the `crack-it` folder and this guide so they can do
  their own free deployment. Useful only if they'd rather manage it themselves.

---

## 🛠️ Troubleshooting

**Students get “Could not reach the game server.”**
The database step didn't finish. Re-check **Step 3** (is the Redis database *connected to the
crack-it project*?) and then **Step 4** (redeploy *after* connecting). A redeploy is required
for the database keys to take effect.

**A student's name never appears on the teacher's board.**
Almost always the same cause as above. Also confirm everyone is opening the **exact same link**
and typing the **same room code** (codes avoid confusing characters, so there's no 0/O or 1/I).

**The `api` folder / leaderboard isn't working at all.**
Open your GitHub repo and make sure the file is at **`api/store.js`** (inside the `api` folder),
not loose in the main folder. If it's in the wrong place, delete it and redo Step 1, points 8–11.

**I changed the game — how do I update the live version?**
Edit the file on GitHub (open it → pencil ✏️ icon → make changes → Commit). Vercel
auto-redeploys within a minute. No extra steps.

---

## ❓ Quick FAQ

**Is it really free?** Yes. Vercel's Hobby plan and Upstash's free database cover classroom use
comfortably (the free database allows ~500,000 operations per month; a typical class round uses
only a couple of thousand). No credit card needed.

**Is student data safe?** Students only type a first name and their guesses. Rounds and scores
are stored temporarily and **auto-delete after 24 hours**. No emails, logins, or personal data
are collected.

**Can I reset a leaderboard mid-lesson?** Yes — the teacher screen has a **🗑️ Reset scores**
button. Students already playing keep their game; only the board clears.

**Does it work on phones?** Yes — it's designed mobile-first. Students can use phones, tablets,
or laptops, on any network.

**What if I open `index.html` directly on my computer (not the live link)?** It still runs, but
in a single-device practice mode — the shared leaderboard only works through the live Vercel
link. Always use the `.vercel.app` link with your class.
