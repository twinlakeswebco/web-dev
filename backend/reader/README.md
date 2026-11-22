# Single-article reader

Public preview: `/blog/articles/twin-lakes-owensboro-health-surplus-staffing-investigation/`.
The complete authored Markdown remains outside this public repository. It is rendered
by `scripts/prepare_paid_article.py` into a private SQL file and stored in D1 `articles`.
Never commit the full article, SQL seed, Stripe signing secret, or email API key.

## Deployed resources

- Cloudflare Worker: `twin-lakes-article-reader`
- D1: `twin-lakes-reader` (`abd29f5f-2a61-4689-b23e-46dc8295d636`)
- Route: `www.twinlakesweb.com/api/reader/*` (requires proxied www DNS)
- Stripe one-time price: `price_1UefcIAp0FzsFGWxAvvzkmsW`, USD 1.35
- Stripe Payment Link: `plink_1UefcoAp0FzsFGWx3ELQEfn4`
- Stripe webhook: `we_1UefdXAp0FzsFGWxkQwjGXZn`

No surcharge, subscription, invoice fee, or Stripe Tax collection. Checkout has
one fixed-quantity line item. Price and payment link changes require updating
the webhook amount validation deliberately. Only successful, signed events
from the expected link grant access. A success redirect alone never does.

## Finish email setup

Add a **secret** named `RESEND_API_KEY` to the Worker, using a Resend key authorized
to send from the already-verified `twinlakesweb.com` domain. The sender is
`Twin Lakes Web Co. <reader@twinlakesweb.com>`. Alternatively, configure an `EMAIL`
binding with Cloudflare Email Sending and an onboarded domain on an eligible plan.
The checkout endpoint remains disabled until an email binding or Resend key exists.
After adding it, verify delivery to the owner and the recovery flow before launch.
No API key is needed for Stripe at runtime: signed Payment Link webhooks provide
the payment proof. Store `STRIPE_WEBHOOK_SECRET` only as a Worker secret.

## Run checks and deploy

`node --test backend/reader/reader.test.mjs` (Node 22.13+ with node:sqlite).

`python3 scripts/build_blog.py` and `python3 scripts/check_brand.py` (Python 3.12).

From this directory, `npx wrangler deploy`; existing Worker secrets are retained.
To install schema: `npx wrangler d1 execute twin-lakes-reader --remote --file schema.sql`.
Prepare private article SQL outside the repository and execute that file against
the same database. Never add the seed file to public build output or Git.

## Access behavior

The browser uses a random Secure, HttpOnly, SameSite=Lax cookie. Only hashes
of session secrets and restore tokens are stored. A signed successful checkout
creates a purchase and grants the initiating browser access. Payment Link
purchases without an initiating cookie can be restored using the checkout email.
Device grants last one year; the purchase persists and email restoration renews
device access. Email restore links expire in 15 minutes and are single-use.
Tokens are carried in URL fragments and removed before use. Recovery has rate
limits and gives the same response for known and unknown emails.

Full refunds and disputes revoke access, including out-of-order notifications.
Dispute resolution requires an explicit operator decision before removing a
payment block; won disputes do not silently restore access. Partial refunds
leave access unchanged. Daily cleanup removes expired transient records.
Purchases and payment blocks are retained to keep access and revocation durable.

The API does not cache paid responses. No access check depends on a redirect,
hidden DOM, localStorage, or an unguessable public article URL.
