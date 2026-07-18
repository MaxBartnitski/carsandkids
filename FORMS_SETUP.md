# Website forms setup (Sheet + email)

Website modals POST to a **Google Apps Script** web app bound to a **Cars & Kids Intake** spreadsheet. Each submission:

1. Appends a row to the Sheet (source of truth)
2. Emails `info@carsandkids.net`
3. Sends an auto-reply to the submitter from `info@carsandkids.net`

## Prerequisites

- Google Workspace account that can **send as** `info@carsandkids.net` (Settings → Accounts → Send mail as)
- Source code in this repo: [`forms-handler/Code.gs`](forms-handler/Code.gs)

## 1. Create the intake spreadsheet

1. In Google Drive (Workspace), create a new spreadsheet named **Cars & Kids Intake**
2. Keep it private (only you / team need access)
3. Bookmark the URL — this is your CRM list

## 2. Install the Apps Script

1. Open the spreadsheet → **Extensions** → **Apps Script**
2. Delete any default `Code.gs` content
3. Paste the full contents of [`forms-handler/Code.gs`](forms-handler/Code.gs)
4. Save the project (name it `Cars & Kids Forms`)

## 3. Initialize sheet tabs and headers

1. In the Apps Script editor, select **`setupIntakeSheet`** from the function dropdown
2. Click **Run** (authorize Gmail + Sheets when prompted)
3. Refresh the spreadsheet — you should see tabs: **All**, **Drive**, **Visit**, **Support** with header rows

Each submission gets `status = New`. Update status manually (Contacted, Scheduled, Closed, Declined) as you work leads.

## 4. Deploy as web app

1. **Deploy** → **New deployment**
2. Type: **Web app**
3. Execute as: **Me** — use the **info@carsandkids.net** account (or an account with info@ set as default **Send mail as**)
4. Who has access: **Anyone**
5. Deploy → copy the **Web app URL** (ends in `/exec`)

Test health check in browser:

```
https://script.google.com/macros/s/YOUR_ID/exec?health=1
```

Should return `{"ok":true,"service":"carsandkids-forms"}`.

## 5. Wire the website

Edit [`forms-config.js`](forms-config.js) and set:

```javascript
window.CARSANDKIDS_FORMS_URL = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';
```

Commit and push to GitHub Pages.

## 6. End-to-end test

### Quick test from Apps Script editor

1. Set `TEST_EMAIL` at the bottom of `Code.gs` to your inbox
2. Run **`testDriveSubmission`**, **`testVisitSubmission`**, **`testSupportSubmission`**
3. Check logs for `{"ok":true}`

### Live website test

For each form (Drive, Visit, Support):

- [ ] Row appears on **All** tab and the matching type tab
- [ ] Notification arrives at **info@carsandkids.net**
- [ ] Auto-reply arrives at the submitter email
- [ ] Reply on the notification goes to the submitter

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
| Email not sent | Confirm **Send mail as** info@ is verified on the deploying account |
| `Invalid form type` | Website must send `formType`: `drive`, `visit`, or `support` |
| Spam submissions | Honeypot field `website` must stay hidden; add reCAPTCHA v3 later if needed |

## Updating the script

After editing `Code.gs` in Apps Script:

1. **Deploy** → **Manage deployments** → edit → **New version** → Deploy
2. The `/exec` URL stays the same — no website change needed

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
