import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import middleware, { config } from "./middleware";

// The gate itself lives in the boundary between Vercel's edge and the browser,
// so whether it is in the request path can only be checked against a real
// deployment (see docs/DEPLOY_ACCESS.md). What is testable here is the decision
// the middleware makes about a given request: fail closed, challenge, or pass.

const PASSWORD = "sécret:with:colons";

// An asset path, not "/", so the matcher-covers-everything intent is visible.
function request(headers = {}) {
  return new Request("https://grain-sim.vercel.app/assets/index-abc123.js", {
    headers,
  });
}

function basic(username, password) {
  const encoded = Buffer.from(`${username}:${password}`, "utf8").toString("base64");
  return { authorization: `Basic ${encoded}` };
}

// next() signals "continue" with a 200 carrying this header, rather than a body.
function passedThrough(response) {
  return response.status === 200 && response.headers.get("x-middleware-next") === "1";
}

beforeEach(() => {
  process.env.SITE_PASSWORD = PASSWORD;
});

afterEach(() => {
  delete process.env.SITE_PASSWORD;
  vi.restoreAllMocks();
});

describe("matcher", () => {
  it("covers every path, so no asset route serves content around the gate", () => {
    expect(config.matcher).toBe("/(.*)");
  });
});

describe("fail closed", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("denies every request when SITE_PASSWORD is unset", () => {
    delete process.env.SITE_PASSWORD;
    const response = middleware(request(basic("anyone", PASSWORD)));

    expect(response.status).toBe(503);
    expect(passedThrough(response)).toBe(false);
  });

  it("denies every request when SITE_PASSWORD is empty", () => {
    process.env.SITE_PASSWORD = "";
    const response = middleware(request(basic("anyone", "")));

    expect(response.status).toBe(503);
  });

  it("does not challenge, which would leave the browser re-prompting forever", () => {
    delete process.env.SITE_PASSWORD;
    const response = middleware(request());

    expect(response.headers.get("WWW-Authenticate")).toBeNull();
  });

  it("does not name the missing variable to the visitor", async () => {
    delete process.env.SITE_PASSWORD;
    const response = middleware(request());

    expect(await response.text()).not.toMatch(/SITE_PASSWORD/);
  });
});

describe("challenge", () => {
  it("triggers the browser's native prompt when no credentials are sent", () => {
    const response = middleware(request());

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe(
      'Basic realm="Grain Sim", charset="UTF-8"',
    );
  });

  it.each([
    ["a wrong password", basic("demo", "wrong")],
    ["an empty password", basic("demo", "")],
    ["a password that is only a prefix", basic("demo", PASSWORD.slice(0, -1))],
    ["credentials with no colon", { authorization: "Basic " + Buffer.from("demo").toString("base64") }],
    ["undecodable base64", { authorization: "Basic !!!!" }],
    ["a non-Basic scheme", { authorization: `Bearer ${PASSWORD}` }],
    ["an empty header value", { authorization: "" }],
    ["Basic with nothing after it", { authorization: "Basic" }],
  ])("rejects %s", (_label, headers) => {
    expect(middleware(request(headers)).status).toBe(401);
  });
});

describe("pass through", () => {
  it("lets the request continue when the password is correct", () => {
    expect(passedThrough(middleware(request(basic("demo", PASSWORD))))).toBe(true);
  });

  it("ignores the username, since there is one shared secret and no accounts", () => {
    expect(passedThrough(middleware(request(basic("", PASSWORD))))).toBe(true);
    expect(passedThrough(middleware(request(basic("anyone-at-all", PASSWORD))))).toBe(true);
  });

  it("accepts the scheme case-insensitively, as RFC 7617 requires", () => {
    const { authorization } = basic("demo", PASSWORD);
    const headers = { authorization: authorization.replace("Basic", "basic") };

    expect(passedThrough(middleware(request(headers)))).toBe(true);
  });

  it("keeps a non-ASCII password intact through base64 decoding", () => {
    process.env.SITE_PASSWORD = "pässwörd-日本";
    const headers = basic("demo", "pässwörd-日本");

    expect(passedThrough(middleware(request(headers)))).toBe(true);
  });
});
