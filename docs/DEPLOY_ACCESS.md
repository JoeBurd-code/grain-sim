# Deployment access

The deployed demo at `grain-sim.vercel.app` sits behind a shared password. The gate is
`middleware.js` at the repo root: Vercel Routing Middleware that performs HTTP Basic
Authentication at the edge, before any response body is produced. An unauthenticated
visitor never receives the application bundle.

Vercel's own Password Protection was not used because it needs Enterprise, or Pro with the
Advanced Deployment Protection add on. Vercel Authentication is available on Hobby but
covers only preview and deployment URLs, leaving the production domain public.

## Configuration

One variable, set in the Vercel dashboard under Settings -> Environment Variables, for
every environment you want reachable (Production, Preview, Development):

| Variable        | Required | Notes                                             |
| --------------- | -------- | ------------------------------------------------- |
| `SITE_PASSWORD` | yes      | The shared password. Rotate here, no code change. |

Redeploy after changing it. The middleware reads `process.env` at request time, but Vercel
only propagates a changed value to a new deployment, so the running one keeps the old
password until you redeploy.

There are no accounts. The browser's Basic auth prompt asks for a username as well, but the
middleware ignores it: **only the password is checked**, so viewers can type anything, or
nothing, in the username field. Inviting someone is telling them one password. The browser
remembers the credentials for the rest of the session.

If `SITE_PASSWORD` is unset or empty the middleware **denies every request with 503**
rather than letting traffic through, so a misconfigured deployment cannot silently expose
the site. Two deliberate details there: it does not send a `WWW-Authenticate` header,
because no credential could satisfy it and the browser would prompt forever; and it does
not tell the visitor which variable is missing, logging that to the Vercel function logs
instead.

## Local development

`npm run dev` does not run the middleware. Vite serves the app directly, so local
development is never prompted for a password.

## Verifying a deployment

`middleware.test.js` covers the decision the middleware makes about a given request:
fail closed, challenge, or pass through. What it cannot cover is whether the gate is
actually in the request path on Vercel. Check that against the deployment:

```bash
SITE=https://grain-sim.vercel.app

# 1. Root is challenged, with the header that triggers the browser prompt.
curl -si "$SITE/" | head -n 5                       # expect 401 + WWW-Authenticate: Basic

# 2. Asset paths are challenged too: no route serves content around the gate.
#    Take a real path from dist/assets after a build.
curl -si "$SITE/assets/index-<hash>.js" | head -n 1  # expect 401

# 3. Correct credentials load the app.
curl -si -u demo:'<password>' "$SITE/" | head -n 1   # expect 200

# 4. Wrong credentials do not.
curl -si -u demo:wrong "$SITE/" | head -n 1          # expect 401
```

To check the fail-closed path against the real platform, remove `SITE_PASSWORD` in a
preview environment, redeploy, and confirm requests return 503.

## What this does and does not protect

It protects the **deployed demo**, not the information in it.

The repository is public by choice, and the plant *topology* — machine names, connections,
capacities, set points — lives in `src/line/lineData.js`, which is tracked and readable
directly on GitHub: someone stopped by the password can still read what the demo displays
in the source. The underlying real-plant *documents* those numbers were transcribed from
(client name, vendor, drawing numbers, the engineer's own worksheet) are not: `REAL_LINE_SPECS.md`,
`PLC_FUNCTIONAL_DESCRIPTION.md`, `TREATER_LINE2_WORKSHEET.md`/`.html`, and the filled
worksheet are gitignored and kept local-only, cited by filename in code comments but not
committed.

Making the repository private would close the remaining gap (the plant topology itself) and
does not affect Vercel deployment. Vercel builds and deploys private GitHub repositories on
every plan, including Hobby. Repository visibility and deployment capability are unrelated.
That is a separate decision, noted here rather than taken.

Also out of scope by design: rate limiting, lockout after repeated failures, and audit
logging. Basic auth sends the password on every request, so this relies on HTTPS, which
Vercel provides.
