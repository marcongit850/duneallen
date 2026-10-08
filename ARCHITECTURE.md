# Friends of Dune Allen: architecture

Last checked against the code and Cloudflare on Oct 8, 2026.

## What it does

A one page "coming soon" site for Friends of Dune Allen. Static only, no forms.

## Domains and Worker

- Worker: `duneallen`
- Custom domains (attached in the Cloudflare dashboard): `friendsofduneallen.com`, `www.friendsofduneallen.com`
- workers.dev host is enabled.

## Data and images

- The repo holds only `index.html` and `README.md`. No bindings, no D1, R2, KV, or external services.

## Secrets and env vars (names only)

None.

## Cron and scheduled jobs

None. The Worker has only a fetch handler and no cron trigger.

## How it deploys

- Cloudflare Workers Builds, auto deploy on merge to `main`. Repo `marcongit850/duneallen`, trigger `58b95202-cc74-4c43-a5a5-2ae9b790b4f0`, build command empty, deploy command `npx wrangler deploy`, root `/`.
- If a merge does not deploy: `POST /accounts/f1c59948520f1ec39473238b621c7e24/builds/triggers/58b95202-cc74-4c43-a5a5-2ae9b790b4f0/builds` with body `{"branch": "main", "commit_hash": "<full 40 character sha>"}`. Check builds with `GET /accounts/f1c59948520f1ec39473238b621c7e24/builds/workers/3143aa1c599f487aa370cd855e351ba3/builds?per_page=2` and match `commit_hash`.

## Known gotchas

- There is no `wrangler.jsonc` in this repo. `npx wrangler deploy` still succeeds (last build Oct 2, 2026), so Wrangler appears to infer a static assets setup. Add a `wrangler.jsonc` (name `duneallen`) before adding anything beyond static HTML.
- With no `.assetsignore`, every file in the repo is public, including `README.md` (https://friendsofduneallen.com/README.md).

TODO: confirm the intended Wrangler config for this site and commit a `wrangler.jsonc`.

## Standing rule

Any PR that changes architecture (new secret, cron, storage, binding, or deploy change) must update this file in the same PR.
