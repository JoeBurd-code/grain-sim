# HTTP Basic Auth at the edge, not Vercel's native Password Protection

The deployed demo is gated by `middleware.js` (Vercel Routing Middleware) doing
HTTP Basic Auth against a single `SITE_PASSWORD` env var, checked before any
response body is produced. Vercel's own Password Protection was not used because
it requires Enterprise, or Pro plus the Advanced Deployment Protection add-on;
Vercel Authentication (available on Hobby) only covers preview and deployment
URLs and leaves the production domain public. Custom middleware was the only way
to gate the production URL without a paid add-on.

## Consequences

This protects the deployed demo, not the information in it — the repository is
public by choice, so anyone can read the same plant data (`lineData.js`,
`docs/REAL_LINE_SPECS.md`) directly on GitHub without the password. Making the
repo private would close that gap and is a separate, deliberately undecided
question (see `docs/DEPLOY_ACCESS.md`). Rate limiting, lockout, and audit logging
are also out of scope by design — this relies on HTTPS for transport security,
which Vercel provides.
