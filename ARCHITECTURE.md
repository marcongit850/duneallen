# Friends of Dune Allen: architecture

Last checked against the code on Oct 15, 2026.

## What it does

A one page site for Friends of Dune Allen. It tells the story of the Dune Allen beach ownership case and invites support for Dune Allen Beach, Inc.'s legal effort. Static pages are served from `public/`. `POST /api/contact` sends the contact form through the Workers `send_email` binding.

The page does not publish an email address. The contribution link is not hard coded in the markup.

## Domains and Worker

- Worker: `duneallen`
- Custom domains (attached in the Cloudflare dashboard, not in this file): `friendsofduneallen.com`, `www.friendsofduneallen.com`
- workers.dev host stays enabled (Wrangler default).
- Canonical URL: `https://friendsofduneallen.com/`

## Routes

- `GET /` and other static files: Workers static assets from `public/` (`index.html`, CSS, JS, images, fonts).
- Unknown paths: `public/404.html` (`assets.not_found_handling` is `404-page`).
- `POST /api/contact`: Worker script. `assets.run_worker_first` is `["/api/*"]`, so only `/api/*` hits the script before assets. Anything else under `/api/` falls through to `env.ASSETS.fetch`.
- `GET /api/contact` returns 405.

## Data and images

- No D1, R2, KV, or paid third party services.
- Page images live in `public/images/` as WebP (the social card is `public/images/og.jpg`, a crop of the aerial).
- Originals used to build those files are in `media/` (logo, Marc's aerial, historic shoreline, and the four Wikimedia downloads). `media/` is outside the assets directory, so it is not public.
- Wildlife photos are the four Wikimedia Commons files by The Bushranger, each verified as CC BY-SA 4.0 on its file page. Credits (author, license link, source link, and the resize/WebP change) are in the footer. The three "permission required" images were not used. No deed boundary is drawn on any photo.
- Fonts are self hosted SIL Open Font License files in `public/fonts/` (Fraunces and Source Sans 3), with their license texts beside them.

## Donate link

Set it in one place: `DONATE_URL` in `public/config.js`.

```js
window.FRIENDS_CONFIG = {
  DONATE_URL: ""
};
```

Paste the full `https://` pay link between the quotes. Every Contribute / Support button reads that value and opens it in a new tab. While the string is empty, those buttons scroll to `#help` and the Help section shows "Online contributions coming soon." `/config.js` is cached for 60 seconds (`public/_headers`).

## Contact form

- Fields: name, email, phone (optional), message, plus a honeypot (`fax_number`) and a `startedAt` timestamp.
- A filled honeypot, or a submit sooner than two seconds after the script set `startedAt`, returns the success message and does not send mail.
- Validation and a per-isolate limit of 5 accepted messages per IP per 10 minutes live in `src/contact.ts`. The limit is not global across Cloudflare's network. It resets when an isolate restarts.
- Turnstile is not wired. A widget sitekey and secret would have to be created in the dashboard first. The honeypot and rate limit are the spam controls for now.
- The browser posts JSON to `/api/contact`. A no-JavaScript submit (normal form post) gets a short HTML result page.
- Subject line: `New message from Friends of Dune Allen`.
- Reply-To is the visitor's address, so a reply goes to them. That address is not shown on the site.

## Secrets and env vars (names only)

No secrets.

Wrangler vars in `wrangler.jsonc` (a deploy writes these onto the Worker and replaces dashboard values):

- `CONTACT_TO`: where the form is delivered. Currently `marc@whpinc.com`. Change this string to move delivery to another verified destination. The code reads `env.CONTACT_TO` only.
- `CONTACT_FROM`: the from address. Currently `noreply@friendsofduneallen.com`.

Binding:

- `EMAIL`: Workers `send_email` binding, with no `destination_address` lock, so `CONTACT_TO` can change without editing the binding. The address must already be a verified Email Routing destination on this account.
- `ASSETS`: static assets binding.

## Email Sending and Email Routing (dashboard)

Outbound mail from `noreply@friendsofduneallen.com` will fail until the zone is allowed to send.

1. Cloudflare dashboard, **Compute > Email Service > Email Sending > Onboard Domain**, choose `friendsofduneallen.com`, and accept the SPF, DKIM, and DMARC records on `cf-bounce`. That is the step the `send_email` binding needs for the from address. Docs: https://developers.cloudflare.com/email-service/get-started/send-emails/
2. `marc@whpinc.com` is already a verified destination. Keep it verified under **Email Routing** destination addresses. If `CONTACT_TO` changes, verify the new address the same way before deploying.
3. Email Routing on the `friendsofduneallen.com` zone itself (inbound MX) is separate from sending. Turn it on only if this domain should receive mail at Cloudflare. Enabling it adds MX records and can interrupt an existing inbox. The contact form does not need an inbound routing rule.

`npx wrangler dev` simulates `send_email` locally and does not deliver real mail. Do not set `"remote": true` on the binding unless you mean to send real messages.

## Cron and scheduled jobs

None. The Worker has only a fetch handler.

## How it deploys

- Cloudflare Workers Builds, auto deploy on merge to `main`. Repo `marcongit850/duneallen`, trigger `58b95202-cc74-4c43-a5a5-2ae9b790b4f0`, build command empty, deploy command `npx wrangler deploy`, root `/`.
- Wrangler bundles `src/index.ts`. There is no separate build step. `compatibility_date` is `2026-10-15`.
- Logs and traces are on (`observability.enabled`, `observability.logs.enabled`, `observability.traces.enabled`), sampling rate 1. Contact logs are structured JSON and do not include the message body.
- If a merge does not deploy: `POST /accounts/f1c59948520f1ec39473238b621c7e24/builds/triggers/58b95202-cc74-4c43-a5a5-2ae9b790b4f0/builds` with body `{"branch": "main", "commit_hash": "<full 40 character sha>"}`. Check builds with `GET /accounts/f1c59948520f1ec39473238b621c7e24/builds/workers/3143aa1c599f487aa370cd855e351ba3/builds?per_page=2` and match `commit_hash`.

## What is public

Only `public/` is uploaded. `public/.assetsignore` is a second guard against docs, source, and config if those files are ever copied into `public/`. `README.md`, `ARCHITECTURE.md`, `wrangler.jsonc`, and `src/` are not on the site.

`_headers` sets a content security policy (`default-src 'self'`), `nosniff`, a referrer policy, and cache times.

## Local check

`npm install`, then `npm test` and `npx wrangler dev`. Generate binding types with `npx wrangler types` (the generated file is gitignored). `npm run check` runs types, `tsc`, tests, and `wrangler deploy --dry-run`.

## Standing rule

Any PR that changes architecture (new secret, cron, storage, binding, or deploy change) must update this file in the same PR.
