# Contact intake

Accepts 0 to 10 original images, each at most 15 MiB. One picture per request
avoids a 150 MB combined request. Cloudflare Turnstile protects `/start` with
action `contact` and exact production hostname checks. Signed upload tokens
bind each subsequent request to its manifest, with size, signature, and SHA-256
validation. Tokens expire after 24 hours.

`Code.gs` runs as `casey@twinlakesweb.com`. It creates a private child folder of
`1Fo5UMBAMnvaQD05kdbmIe9U11JpPZNnZ` named `YYYY-MM-DD-Name-Intake` using the
America/New_York date. Each contains `intake.txt`, the original pictures, and
`intake-state.json` for recovery. The email includes every answer and a folder
link, with the visitor as Reply-To. It goes to `casey@twinlakesweb.com` after all
pictures are saved. Drive sharing is never widened.

## Deployment

1. Open the prepared Apps Script project as casey@twinlakesweb.com:
   https://script.google.com/u/5/home/projects/1I2Di5qFj5CcT0Fa1D1tscQnWW6421GigpCNbUlUh1TVe_jdvpv4a4M_o/edit
2. Save `Code.gs`, run `setupIntake`, and authorize Drive access and email sending.
   Setup checks folder access and quota, and creates `RELAY_SECRET` in Script
   Properties. Never put the secret in chat, logs, or source control.
3. Deploy a Web App executing as yourself, accessible to Anyone. Requests require
   the private relay secret. Use the `/exec` deployment URL, never `/dev`.
4. Set `APPS_SCRIPT_URL` and secret `RELAY_SECRET` on the `twinlakes-intake` Worker
   in account `fa1086d11708a5183253488970082fb8`. `TURNSTILE_SECRET` is already
   stored there. Enable workers.dev for `twinlakes-intake.caseykeown.workers.dev`.
5. Test a real Turnstile token, inquiry, and pictures. Verify folder contents,
   received email, and replay rejection. Publish the frontend after this passes.

## Tests and recovery

Run `node --test backend/intake/intake.test.mjs` and
`python3 scripts/build_site.py`. Tests exercise the real Worker and Apps Script
with simulated Drive and Mail APIs. A deployed browser test is also required.

Retries reuse the UUID, same folder, same filenames, and saved completion state.
Changed answers or files on the same UUID return a conflict. Email state is
persisted as `sending` before MailApp runs. If execution stops between send and
confirmation, retries stop with an explicit message. Check `intake-state.json`
and sent mail before resolving that rare state. Incomplete inquiries retain
their answers and any received pictures for recovery.
