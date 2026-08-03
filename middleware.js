import { next } from "@vercel/functions";

// Vercel Routing Middleware: HTTP Basic Authentication in front of the whole
// deployment. This runs at the edge before any response body is produced, so an
// unauthenticated visitor never receives the application bundle.
//
// One shared secret, in the Vercel environment variable SITE_PASSWORD. There are
// no accounts, so the username field is not checked: viewers are told a password
// and can type anything above it. Absent SITE_PASSWORD, every request is denied.
//
// The Vite dev server does not run this file, so local development is unaffected.
// See docs/DEPLOY_ACCESS.md.

// Run on every path, including hashed asset bundles. Excluding static files is
// the usual performance advice but would leave a route around the gate.
export const config = {
  matcher: "/(.*)",
};

const REALM = "Grain Sim";

const PLAIN_TEXT = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "no-store",
};

export default function middleware(request) {
  const expected = process.env.SITE_PASSWORD;

  // Fail closed: a deployment missing the secret denies access rather than
  // silently serving the site. No WWW-Authenticate header, because no
  // credential could ever satisfy this and the browser would just re-prompt.
  // The reason goes to the Vercel logs, not to the visitor.
  if (!expected) {
    console.error("SITE_PASSWORD is not set; denying all requests.");
    return new Response("This deployment is not available.", {
      status: 503,
      headers: PLAIN_TEXT,
    });
  }

  const presented = parseBasicPassword(request.headers.get("authorization"));
  if (presented === null || !constantTimeEqual(presented, expected)) {
    return new Response("Authentication required.", {
      status: 401,
      headers: {
        "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"`,
        ...PLAIN_TEXT,
      },
    });
  }

  return next();
}

// Returns the password from a Basic Authorization header, or null if the header
// is missing, is not Basic, or is not decodable. The username is ignored.
function parseBasicPassword(header) {
  if (!header) return null;

  const [scheme, encoded] = header.split(" ");
  if (!encoded || scheme.toLowerCase() !== "basic") return null;

  let decoded;
  try {
    decoded = decodeBase64Utf8(encoded);
  } catch {
    return null;
  }

  // Only the first colon separates username from password; a password may
  // contain more.
  const separator = decoded.indexOf(":");
  if (separator === -1) return null;

  return decoded.slice(separator + 1);
}

// atob yields a binary string; reinterpreting the bytes as UTF-8 keeps
// non-ASCII passwords intact.
function decodeBase64Utf8(encoded) {
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// Compares in time proportional to the longer input rather than to the length
// of the matching prefix. Input lengths are still observable.
function constantTimeEqual(a, b) {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);

  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    difference |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }

  return difference === 0;
}
