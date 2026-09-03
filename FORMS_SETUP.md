# Website forms setup (Sheet + email + volunteer CRM)

Website modals POST to a **Google Apps Script** web app bound to a **Cars & Kids Intake** spreadsheet. Each submission:

1. Appends a row to the Sheet (source of truth)
2. Emails `info@carsandkids.net` (notification; reply goes to the submitter)
3. **Drive and Support only:** creates or updates a Google Contact with the **Volunteer** label, adds the person as a guest on upcoming calendar events titled with `[Cars & Kids]` (and sends those invites), and sends a welcome email **To** `max@carsandkids.net` **BCC** the volunteer

Visit requests stay Sheet + notify only. The website still shows confirmation (no auto-reply from the form itself).

## Prerequisites

- Deploy and run as **`max@makobabusiness.com`** (the Google account that owns Contacts and the calendar). `max@carsandkids.net` and `info@carsandkids.net` must be **Send mail as** aliases on that account.
- Source code in this repo: [`forms-handler/Code.gs`](forms-handler/Code.gs) and [`forms-handler/appsscript.json`](forms-handler/appsscript.json)

## 1. Create the intake spreadsheet

1. In Google Drive (Workspace), create a new spreadsheet named **Cars & Kids Intake**
2. Keep it private (only you / team need access)
3. Bookmark the URL — this is your CRM list

## 2. Install the Apps Script

1. Open the spreadsheet → **Extensions** → **Apps Script**
2. Delete any default `Code.gs` content
3. Paste the full contents of [`forms-handler/Code.gs`](forms-handler/Code.gs)
4. Replace `appsscript.json` (Project Settings → Show `appsscript.json`) with [`forms-handler/appsscript.json`](forms-handler/appsscript.json), **or** enable services by hand:
   - **Services (+)** → **People API**
   - **Services (+)** → **Google Calendar API**
5. Save the project (name it `Cars & Kids Forms`)

## 3. Initialize sheet tabs and headers

1. In the Apps Script editor, select **`setupIntakeSheet`** from the function dropdown
2. Click **Run** (authorize Sheets, Gmail, Contacts, and Calendar when prompted)
3. Refresh the spreadsheet — you should see tabs: **All**, **Drive**, **Visit**, **Support** with header rows

Each submission gets `status = New`. Update status manually (Contacted, Scheduled, Closed, Declined) as you work leads.

**All** tab columns (full CRM view — unused fields stay blank):

`submitted_at | form_type | status | name | email | phone | car | org | can_do | availability | why | org_type | kids | age | location | constraints | timing | support_types | notes`

Type-specific tabs (**Drive** / **Visit** / **Support**) still get a focused copy of each row.

After changing headers: paste updated `Code.gs`, run **`setupIntakeSheet`**, then **Deploy → Manage deployments → New version**. Confirm with `?health=1` that `version` matches `CONFIG.VERSION` in Code.gs.

## 4. Deploy as web app

**First time only:**

1. **Deploy** → **New deployment**
2. Type: **Web app**
3. Execute as: **Me** — must be **`max@makobabusiness.com`** (Contacts + calendar live on this account)
4. Who has access: **Anyone**
5. Deploy → copy the **Web app URL** (ends in `/exec`) and put it in `forms-config.js`

**Every later update:** **Deploy → Manage deployments → pencil on that same web app → New version.** The `/exec` URL must stay the same. If the URL changes, you created a new deployment; update `forms-config.js` and push, or archive the extra deployment and edit the one the site already uses.

Test health check in browser:

```
https://script.google.com/macros/s/YOUR_ID/exec?health=1
```

Should return `{"ok":true,"service":"carsandkids-forms","version":"..."}`.

## 5. Wire the website

Edit [`forms-config.js`](forms-config.js) and set:

```javascript
window.CARSANDKIDS_FORMS_URL = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';
```

Commit and push to GitHub Pages.

## 6. Calendar event titles

Upcoming events the volunteer should be invited to must have **`[Cars & Kids]`** in the title, on a calendar `max@makobabusiness.com` can edit.

Example: `[Cars & Kids] Children's Hospital — June 14`

Personal events without that tag are ignored. If none match, the `info@` notification subject includes **NO UPCOMING [Cars & Kids] EVENTS** and the welcome does not claim invites were sent.

Guest list stays however you set it on the event. The script does not change visibility.

## 7. End-to-end test

### Quick test from Apps Script editor

1. Leave `TEST_EMAIL` as `max@carsandkids.net` (or set it to your inbox)
2. Keep `CONFIG.TEST_SEND_CALENDAR = false` so editor tests **do not** add the test address to live events
3. Run **`testDriveSubmission`**, **`testVisitSubmission`**, **`testSupportSubmission`**
4. Check logs for `{"ok":true}`
5. Drive/Support tests create or update a **Volunteer** contact and send a welcome **To** `max@carsandkids.net` (BCC `TEST_EMAIL`). Delete the test contact if you do not want it.

To actually send calendar invites from an editor test, set `CONFIG.TEST_SEND_CALENDAR = true`, run once, then set it back to `false` before deploying.

### Live website test

For each form (Drive, Visit, Support):

- [ ] Row appears on **All** tab and the matching type tab
- [ ] Notification arrives at **info@carsandkids.net**
- [ ] Website shows the thank-you panel
- [ ] Reply on the notification goes to the submitter
- [ ] Drive/Support: Google Contact exists with **Volunteer** label
- [ ] Drive/Support: guest on upcoming `[Cars & Kids]` events + calendar invite received
- [ ] Drive/Support: welcome in inbox (To `max@`, volunteer BCC'd)

Or run from repo:

```bash
cd forms-handler
./verify-endpoint.sh   # after setting URL in forms-config.js
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Form shows error on submit | Check browser console; verify deploy URL in `forms-config.js` |
| Sheet row missing | Run `setupIntakeSheet()`; confirm script is bound to the spreadsheet |
| Notification not sent | Confirm **Send mail as** info@ is verified on the deploying account |
| Welcome not sent / `send as` error | Add **max@carsandkids.net** under Gmail → Settings → Accounts → Send mail as |
| Contact or calendar error in notify subject | Services (+) must list **People API** and **Google Calendar API**. Then **Deploy → Manage deployments → pencil → New version** (editor-only enable does not update `/exec`). Re-authorize if prompted. Run `checkAdvancedServices` in the editor to confirm the libraries loaded. |
| No calendar invites | Title events with `[Cars & Kids]`; confirm they are upcoming; confirm writer access |
| Duplicate welcome | Repeat signups that already have the Volunteer label skip a second welcome |
| `Invalid form type` | Website must send `formType`: `drive`, `visit`, or `support` |
| Spam submissions | Honeypot field `website` must stay hidden; add reCAPTCHA v3 later if needed |

If Contact, Calendar, or welcome fails after the Sheet write, the volunteer still sees thank-you. The `info@` notification subject starts with **CONTACT/CALENDAR/WELCOME FAILED** and the body lists the error.

## Updating the script

After editing `Code.gs` in Apps Script:

1. Enable People API + Calendar API if they are not already on (left sidebar **Services (+)**)
2. **Deploy** → **Manage deployments** → pencil on the **existing** web app → **New version** → Deploy
3. The `/exec` URL stays the same — no website change needed
4. Confirm `?health=1` `version` matches `CONFIG.VERSION`

Enabling a service in the editor updates only the draft. The website keeps running the last deployed snapshot until you create a **New version**.

To replay Contact + Calendar for someone who already got a welcome (no second welcome): set `RETRY_EMAIL` in `Code.gs`, then run **`retryVolunteerCrm`**.

## Optional: clasp sync

To push repo changes to Apps Script from CLI:

```bash
npm install -g @google/clasp
cd forms-handler
clasp login
clasp create --type sheets --title "Cars & Kids Forms"  # or clasp clone <scriptId>
clasp push
```

Then run `setupIntakeSheet()` once from the editor.
