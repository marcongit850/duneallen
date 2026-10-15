# Friends of Dune Allen

The site at [friendsofduneallen.com](https://friendsofduneallen.com/). Pages live in `public/`. The Worker in `src/index.ts` sends the contact form.

## Local development

```bash
npm install
npx wrangler dev
```

`wrangler dev` simulates email. It writes the message locally and does not deliver it.

## Settings

Donation link and the optional hero video are both in `public/config.js`. See `ARCHITECTURE.md` for the Email Routing dashboard step, `CONTACT_TO`, and where to drop a future drone clip.
