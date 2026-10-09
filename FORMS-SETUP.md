# Parent forms: setup

Pages added to coach.chesslead.org:

- `/register`: one-time student registration, full coaching policy and signature
- `/event`: event consent by category (Nairobi tournament, outside Nairobi, overnight, trip)
- `/coach`: private page to view, print, export and delete submissions, and to make pre-filled event links

Submissions are stored as private files in Vercel Blob and can only be read with the coach password.

## One-time setup (Vercel dashboard, project `coach-joseph`)

1. **Storage → Create → Blob**, choose **Private**, connect it to `coach-joseph` for all environments. This adds `BLOB_READ_WRITE_TOKEN` automatically.
2. **Settings → Environment Variables → Add**: key `ADMIN_PASSWORD`, a password of at least 10 characters, all environments.
3. Upload these files to the GitHub repo `Gathogo15514/coach-joseph` (Add file → Upload files), keeping the folders. Vercel deploys automatically.

## Files

- `api/submit.js`, `api/submissions.js`, `api/_lib.js`: storage and coach-only API
- `forms/forms.css`, `forms/forms.js`: shared styles and form logic
- `register/index.html`, `event/index.html`, `coach/index.html`: the pages
- `package.json`: adds the `@vercel/blob` library

If the policy text changes, update section F in `register/index.html` and the `policyVersion` date at the bottom of both form pages.
