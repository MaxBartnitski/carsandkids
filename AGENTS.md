# Agent notes — carsandkids

Static nonprofit site (plain HTML/CSS/JS) deployed via GitHub Pages to carsandkids.net. No build step — edits to `index.html`/`styles.css` go live on push to `main`. This is a PUBLIC repo: never commit secrets, personal documents, or large binaries.

## Fail loudly, never skip gracefully

Never "skip gracefully," swallow errors, or silently degrade. Missing config, absent files, unexpected states, or empty results where data was expected are **errors** — surface them and stop. Deploy/publish steps must exit non-zero when a required precondition is missing, never print "skipping" and go green. Verify side effects actually happened and fail loudly if they didn't. No empty catches, no fallbacks that hide reality.

## Cross-device plan (hq repo)

The canonical cross-project plan is `PLAN.md` in the private repo `MaxBartnitski/hq`. Read it for current state before multi-session work (`gh api repos/MaxBartnitski/hq/contents/PLAN.md --jq .content | base64 -d`); update it in the same session when you complete work that corresponds to a plan item (check off lines, add a dated Done-log entry, commit with a clear message). Never put secrets in PLAN.md.

## Media

Event photos and videos live in `media.js`, keyed by the event `id` from `events.js`. The media page renders one gallery per event (photos first, then videos), and each past event card links to `/media/#<event-id>`. Videos marked `livePhoto: true` are accidental 1–3 second Live Photo clips: kept in the repo, not shown. Strip EXIF/GPS and resize new photos to 1024px on the long side before committing.
