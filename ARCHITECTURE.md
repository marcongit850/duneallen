# Friends of Dune Allen: architecture

Last checked against the code on Oct 15, 2026.

## What it does

A one page site for Friends of Dune Allen. It tells the story of the Dune Allen beach ownership case and invites support for Dune Allen Beach, Inc.'s legal effort. Static pages live in `public/`. `POST /api/contact` sends the contact form through the Cloudflare Email Routing `send_email` binding.

## Domains and Worker

- Worker: `duneallen`
- Custom domains (attached in the Cloudflare dashboard): `friendsofduneallen.com`, `www.friendsofduneallen.com`
- workers.dev host is enabled.
- Canonical URL: `https://friendsofduneallen.com/`

## Routes

- `GET /` and other files in `public/` are static assets. `assets.not_found_handling` is `404-page` (`public/404.html`).
- `POST /api/contact` runs the Worker first (`assets.run_worker_first`: `/api/*`). JSON responses are for the page script. A normal form post (no JavaScript) gets a small HTML result page.
- Any other method on `/api/contact` returns 405. Any other `/api/*` path returns 404.

The contact handler checks a honeypot field (`company_website`), rejects cross-origin posts when an `Origin` header is present, and limits each IP to 5 requests per 10 minutes inside the isolate. That limit is best effort: it is not shared across every edge isolate.

## Data and images

- No D1, R2, KV, or paid third party services.
- Brand logo source: `images/logo.png` (not public). The header uses `public/images/logo.webp`, a transparent background version of that mark. Favicons are cropped from the D.
- Hero still: `public/images/hero.webp` (Marc's aerial). Historic shoreline: `public/images/historic.webp`.
- Wildlife photos in the community section are the four Wikimedia Commons files by The Bushranger, verified as CC BY-SA 4.0 on their Commons file pages. Credits (author, license link, source link, and the WebP edit) are in the footer. The three "permission required" images from the image guide are not used. No deed boundary is drawn on any photo.

## Donate link

Every Contribute button reads `DONATE_URL` in `public/config.js`.

- Set it to the full `https://` pay link. Buttons then open that URL in a new tab, and the "Online contributions coming soon" line is hidden.
- Leave it as `""` until the link exists. Buttons stay on the page and scroll to `#help`, which shows "Online contributions coming soon." Nothing points at a broken URL.

## Hero video

The hero is the aerial photograph until a video is configured.

1. Put a short MP4 in `public/media/` (optional WebM beside it).
2. In `public/config.js`, set `HERO_VIDEO` to the public path, for example `"/media/hero.mp4"`.
3. Optionally set `HERO_VIDEO_WEBM` the same way.

The video is muted, looping, inline, and uses the aerial as its poster. If `HERO_VIDEO` is empty, the file is missing, or the visitor has `prefers-reduced-motion`, the aerial stays.

## Secrets and env vars (names only)

Vars in `wrangler.jsonc` (not secrets):

- `CONTACT_TO`: where the contact form is delivered. Currently `marc@whpinc.com`. To switch to the client's address, change this value. The new address must already be a verified Email Routing destination on this account.
- `CONTACT_FROM`: the from address, `noreply@friendsofduneallen.com`. It is not shown on the page.

Binding:

- `EMAIL` (`send_email`), restricted with `allowed_sender_addresses` to `noreply@friendsofduneallen.com`. The Worker calls `env.EMAIL.send` with subject `New message from Friends of Dune Allen` and `replyTo` set to the visitor's email.

No secrets are stored in the repo.

## Dashboard step before the form can deliver

Email Routing has to be enabled on the `friendsofduneallen.com` zone (Cloudflare dashboard: Email, Email Routing, for that zone), with the DNS records Cloudflare asks for so the zone can send. `marc@whpinc.com` must stay a verified destination. `noreply@friendsofduneallen.com` is the sender, not a destination. Local `wrangler dev` simulates the binding and does not deliver real mail unless `remote` is turned on for the binding. Do not enable `remote` for routine local checks.

## Cron and scheduled jobs

None.

## How it deploys

- Cloudflare Workers Builds, auto deploy on merge to `main`. Repo `marcongit850/duneallen`, trigger `58b95202-cc74-4c43-a5a5-2ae9b790b4f0`, build command empty, deploy command `npx wrangler deploy`, root `/`.
- Wrangler config is `wrangler.jsonc` (`name`: `duneallen`). Only `public/` is uploaded as assets, so `README.md`, `ARCHITECTURE.md`, and the Worker source are not public.
- If a merge does not deploy: `POST /accounts/f1c59948520f1ec39473238b621c7e24/builds/triggers/58b95202-cc74-4c43-a5a5-2ae9b790b4f0/builds` with body `{"branch": "main", "commit_hash": "<full 40 character sha>"}`. Check builds with `GET /accounts/f1c59948520f1ec39473238b621c7e24/builds/workers/3143aa1c599f487aa370cd855e351ba3/builds?per_page=2` and match `commit_hash`.

## Observability

Workers Logs are enabled. Traces are enabled with `head_sampling_rate` 0.01. Contact logs are structured JSON and do not include the message body or the visitor's email address.

## Known gotchas

- Custom domains are attached in the dashboard. This config does not declare routes, so a deploy does not try to recreate them.
- The rate limit resets when a new isolate starts, and it is not a global counter.
- Turnstile is not wired. It needs a widget and a siteverify secret created in the dashboard. The form uses a honeypot and the rate limit instead.

## Standing rule

Any PR that changes architecture (new secret, cron, storage, binding, or deploy change) must update this file in the same PR.
