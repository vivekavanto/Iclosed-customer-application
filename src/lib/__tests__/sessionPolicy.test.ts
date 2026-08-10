import {
  AUTH_COOKIE_RE,
  SESSION_MAX_AGE_MS,
  authCookieChunks,
  isDeadlinePassed,
  readAccessTokenExpiry,
  sessionDeadlineCookie,
} from "../sessionPolicy";

const encodeSession = (session: unknown) =>
  "base64-" + Buffer.from(JSON.stringify(session)).toString("base64");

describe("AUTH_COOKIE_RE", () => {
  test("matches the session cookie and its chunks", () => {
    expect(AUTH_COOKIE_RE.test("sb-awygszzpyotaddnspikt-auth-token")).toBe(true);
    expect(AUTH_COOKIE_RE.test("sb-awygszzpyotaddnspikt-auth-token.0")).toBe(true);
    expect(AUTH_COOKIE_RE.test("sb-awygszzpyotaddnspikt-auth-token.11")).toBe(true);
  });

  test("does NOT match the PKCE code-verifier cookie", () => {
    // This one is present with NO session. A looser pattern treated it as
    // "visitor is logged in" and let them through the page guard.
    expect(
      AUTH_COOKIE_RE.test("sb-awygszzpyotaddnspikt-auth-token-code-verifier"),
    ).toBe(false);
  });

  test("ignores unrelated cookies", () => {
    expect(AUTH_COOKIE_RE.test("iclosed-session-expires-at")).toBe(false);
    expect(AUTH_COOKIE_RE.test("ph_posthog")).toBe(false);
  });
});

describe("authCookieChunks", () => {
  test("orders chunks numerically, not lexically", () => {
    const cookies = [
      { name: "sb-ref-auth-token.10", value: "k" },
      { name: "sb-ref-auth-token.2", value: "c" },
      { name: "sb-ref-auth-token.0", value: "a" },
      { name: "ph_posthog", value: "nope" },
      { name: "sb-ref-auth-token.1", value: "b" },
    ];

    expect(authCookieChunks(cookies).map((c) => c.value)).toEqual([
      "a",
      "b",
      "c",
      "k",
    ]);
  });

  test("drops empty values and the code-verifier cookie", () => {
    const cookies = [
      { name: "sb-ref-auth-token", value: "" },
      { name: "sb-ref-auth-token-code-verifier", value: "pkce" },
    ];
    expect(authCookieChunks(cookies)).toEqual([]);
  });
});

describe("readAccessTokenExpiry", () => {
  test("reads expires_at from a base64 cookie, in ms", () => {
    const cookies = [
      {
        name: "sb-ref-auth-token",
        value: encodeSession({ access_token: "jwt", expires_at: 1_700_000_000 }),
      },
    ];
    expect(readAccessTokenExpiry(cookies)).toBe(1_700_000_000_000);
  });

  test("reassembles a chunked cookie before parsing", () => {
    const encoded = encodeSession({ expires_at: 1_700_000_000 });
    const split = Math.floor(encoded.length / 2);
    const cookies = [
      { name: "sb-ref-auth-token.1", value: encoded.slice(split) },
      { name: "sb-ref-auth-token.0", value: encoded.slice(0, split) },
    ];
    expect(readAccessTokenExpiry(cookies)).toBe(1_700_000_000_000);
  });

  test("reads a plain (un-encoded) JSON cookie", () => {
    const cookies = [
      {
        name: "sb-ref-auth-token",
        value: JSON.stringify({ expires_at: 1_700_000_000 }),
      },
    ];
    expect(readAccessTokenExpiry(cookies)).toBe(1_700_000_000_000);
  });

  test("survives non-ASCII payloads", () => {
    const cookies = [
      {
        name: "sb-ref-auth-token",
        value: encodeSession({
          expires_at: 1_700_000_000,
          user: { name: "Renée Ünal" },
        }),
      },
    ];
    expect(readAccessTokenExpiry(cookies)).toBe(1_700_000_000_000);
  });

  test("returns null (→ refresh to be safe) when unreadable or absent", () => {
    expect(readAccessTokenExpiry([])).toBeNull();
    expect(
      readAccessTokenExpiry([{ name: "sb-ref-auth-token", value: "garbage" }]),
    ).toBeNull();
    expect(
      readAccessTokenExpiry([
        { name: "sb-ref-auth-token", value: encodeSession({ foo: 1 }) },
      ]),
    ).toBeNull();
  });
});

describe("isDeadlinePassed", () => {
  const now = 1_000_000;

  test("is false while the deadline is in the future", () => {
    expect(isDeadlinePassed(String(now + 1), now)).toBe(false);
  });

  test("is true once the deadline is reached", () => {
    expect(isDeadlinePassed(String(now), now)).toBe(true);
    expect(isDeadlinePassed(String(now - 1), now)).toBe(true);
  });

  test("treats absent/garbage as NOT expired so old sessions get a grace window", () => {
    expect(isDeadlinePassed(undefined, now)).toBe(false);
    expect(isDeadlinePassed("", now)).toBe(false);
    expect(isDeadlinePassed("not-a-number", now)).toBe(false);
  });
});

describe("sessionDeadlineCookie", () => {
  test("expires SESSION_MAX_AGE_MS after now and is not page-readable", () => {
    const now = 1_000_000;
    const cookie = sessionDeadlineCookie(now);

    expect(Number(cookie.value)).toBe(now + SESSION_MAX_AGE_MS);
    expect(cookie.options.maxAge).toBe(Math.floor(SESSION_MAX_AGE_MS / 1000));
    // httpOnly so the page can't extend its own session by rewriting it.
    expect(cookie.options.httpOnly).toBe(true);
  });

  test("defaults to a 3 hour window", () => {
    expect(SESSION_MAX_AGE_MS).toBe(3 * 60 * 60 * 1000);
  });
});
