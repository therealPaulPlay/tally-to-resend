# Tally to Resend

This server creates Resend contacts upon Tally form submission and sends them a confirmation email.

## Deploy

Use the Cloudflare wrangler CLI via `npx wrangler deploy`. If you are not signed in, type `npx wrangler login`.  For adding secrets, use `npx wrangler secret put <secret-name>`.