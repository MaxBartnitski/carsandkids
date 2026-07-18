# Agent notes — carsandkids

Static nonprofit site (plain HTML/CSS/JS) deployed via GitHub Pages to carsandkids.net. No build step — edits to `index.html`/`styles.css` go live on push to `main`. This is a PUBLIC repo: never commit secrets, personal documents, or large binaries.

## Fail loudly, never skip gracefully

Never "skip gracefully," swallow errors, or silently degrade. Missing config, absent files, unexpected states, or empty results where data was expected are **errors** — surface them and stop. Deploy/publish steps must exit non-zero when a required precondition is missing, never print "skipping" and go green. Verify side effects actually happened and fail loudly if they didn't. No empty catches, no fallbacks that hide reality.

## Cross-device plan (retired)

The private **`MaxBartnitski/hq`** repo / local `~/projects/hq` directory was **deleted (Jul 2026)**. Do not fetch or update `PLAN.md` there. Track work in this repo (issues / PRs / Cursor plans) instead.
