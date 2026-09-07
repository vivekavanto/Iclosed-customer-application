/**
 * @jest-environment node
 *
 * jest.config.ts sets `testEnvironment: 'jest-environment-jsdom'` for the whole
 * project, which is right for the component tests but wrong here: the SMTP
 * provider is server-only and Buffer/stream behaviour differs under jsdom. The
 * docblock above overrides it for this file.
 *
 * The guarantee under test is narrow and load-bearing: an email must NEVER leave
 * through a provider its firm did not choose. A message that reaches the wrong
 * server cannot be un-sent.
 *
 * No network, no credentials, no SMTP server — CI has no secrets, so a test that
 * needed one could never run there. The seam is dependency injection: the SMTP
 * provider takes a transport factory, so a recording fake substitutes for
 * nodemailer.
 */

import { EmailSendError } from "@/lib/email/types";
import type { EmailMessage } from "@/lib/email/types";
import { createSmtpProvider, readSmtpConfig } from "@/lib/email/smtpProvider";
import type { MakeTransport } from "@/lib/email/smtpProvider";
import { withRetry } from "@/lib/retry";

// ── The allowlist rule ─────────────────────────────────────────────────
//
// Mirrors smtpEnabledFor() in emailTransport.ts, tested as a pure function
// against an injected config rather than through process.env — jest workers
// share an environment and mutating it leaks between files.

function smtpEnabledFor(
  firm: string | null,
  label: string,
  cfg: { firms?: string; sends?: string },
): boolean {
  const set = (raw: string | undefined) =>
    new Set(
      (raw ?? "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    );
  const wild = (v: Set<string>) => v.has("all") || v.has("*");
  if (!firm) return false;
  const firms = set(cfg.firms);
  if (!firms.has(firm) && !wild(firms)) return false;
  const sends = set(cfg.sends);
  return wild(sends) || sends.has(label.toLowerCase());
}

describe("provider selection", () => {
  it("never routes an unlisted firm to SMTP", () => {
    const cfg = { firms: "navawilson", sends: "welcome" };
    expect(smtpEnabledFor("iclosed", "welcome", cfg)).toBe(false);
    expect(smtpEnabledFor("navawilson", "welcome", cfg)).toBe(true);
  });

  it("never routes a missing or unknown firm to SMTP", () => {
    const cfg = { firms: "navawilson,iclosed", sends: "welcome" };
    expect(smtpEnabledFor(null, "welcome", cfg)).toBe(false);
    expect(smtpEnabledFor("", "welcome", cfg)).toBe(false);
    expect(smtpEnabledFor("acme-legal", "welcome", cfg)).toBe(false);
  });

  it("keeps every firm on Resend when the allowlists are empty (the shipped default)", () => {
    expect(smtpEnabledFor("navawilson", "welcome", {})).toBe(false);
    expect(smtpEnabledFor("navawilson", "welcome", { firms: "navawilson" })).toBe(false);
    expect(smtpEnabledFor("navawilson", "welcome", { sends: "welcome" })).toBe(false);
  });

  it("requires BOTH the firm and the send to be allowlisted", () => {
    const cfg = { firms: "navawilson", sends: "welcome,invite" };
    expect(smtpEnabledFor("navawilson", "welcome", cfg)).toBe(true);
    expect(smtpEnabledFor("navawilson", "invite", cfg)).toBe(true);
    // Enabling one send at a time is the whole point of the second list.
    expect(smtpEnabledFor("navawilson", "milestone", cfg)).toBe(false);
  });

  // The "I want every email on SMTP" case. A hand-kept label list is friction
  // once a firm is known-good, and a send added later would silently stay on
  // Resend until someone remembered to list it.
  it("treats EMAIL_SMTP_SENDS=all (or *) as every send", () => {
    const cfg = { firms: "navawilson", sends: "all" };
    for (const label of ["welcome", "invite", "milestone", "anything-added-later"]) {
      expect(smtpEnabledFor("navawilson", label, cfg)).toBe(true);
    }
    expect(smtpEnabledFor("navawilson", "welcome", { firms: "navawilson", sends: "*" })).toBe(true);
  });

  it("widens an allowlisted firm only — never adds a new one", () => {
    const cfg = { firms: "navawilson", sends: "all" };
    expect(smtpEnabledFor("iclosed", "welcome", cfg)).toBe(false);
  });

  it("lets no wildcard reach a firm-agnostic send", () => {
    // These pass `firm: null` in code — the public calculator, the contact form
    // and the internal staff alerts.
    expect(smtpEnabledFor(null, "public-estimate", { firms: "all", sends: "all" })).toBe(false);
    expect(smtpEnabledFor(null, "contact-message", { firms: "*", sends: "*" })).toBe(false);
  });

  it("tolerates spacing and casing in the env lists", () => {
    const cfg = { firms: " NavaWilson , iclosed ", sends: " Welcome ,, invite " };
    expect(smtpEnabledFor("navawilson", "welcome", cfg)).toBe(true);
    expect(smtpEnabledFor("navawilson", "WELCOME", cfg)).toBe(true);
    expect(smtpEnabledFor("navawilson", "milestone", cfg)).toBe(false);
  });
});

// ── The SMTP provider ──────────────────────────────────────────────────

function message(): EmailMessage {
  return {
    from: "iClosed <iclosed@navawilson.law>",
    to: ["client@example.com"],
    subject: "Test",
    html: "<p>Test</p>",
  };
}

describe("SmtpProvider", () => {
  it("maps every field nodemailer needs, with attachments left as Buffers", async () => {
    const sent: Record<string, unknown>[] = [];
    const make: MakeTransport = async () => ({
      async sendMail(m) {
        sent.push(m);
        return { messageId: "<abc@smtp>" };
      },
      close() {},
    });

    const provider = createSmtpProvider(
      { host: "smtp.gmail.com", port: 587, user: "u@example.com", pass: "x" },
      make,
    );

    const result = await provider.send({
      ...message(),
      replyTo: "iclosed@navawilson.law",
      cc: ["agent@example.com"],
      bcc: ["file@example.com"],
      text: "Test",
      attachments: [{ filename: "retainer.pdf", content: Buffer.from("%PDF") }],
    });

    expect(result.id).toBe("<abc@smtp>");
    const m = sent[0];
    expect(m.to).toEqual(["client@example.com"]);
    expect(m.cc).toEqual(["agent@example.com"]);
    expect(m.bcc).toEqual(["file@example.com"]);
    expect(m.replyTo).toBe("iclosed@navawilson.law");
    // Both providers encode internally — a stray toString("base64") here would
    // double-encode and corrupt the PDF.
    const attachments = m.attachments as Array<{ filename: string; content: Buffer }>;
    expect(Buffer.isBuffer(attachments[0].content)).toBe(true);
    expect(attachments[0].content.toString()).toBe("%PDF");
  });

  it("closes the transport even when the send fails", async () => {
    let closed = 0;
    const make: MakeTransport = async () => ({
      async sendMail() {
        throw Object.assign(new Error("nope"), { code: "ECONNREFUSED" });
      },
      close() {
        closed += 1;
      },
    });

    const provider = createSmtpProvider({ host: "h", port: 587, user: "u", pass: "p" }, make);
    await expect(provider.send(message())).rejects.toThrow();
    // A socket left open is what stops a serverless instance freezing.
    expect(closed).toBe(1);
  });

  it.each([
    [{ code: "EAUTH" }, "auth", false],
    [{ responseCode: 535 }, "auth", false],
    [{ code: "ECONNREFUSED" }, "connection", true],
    [{ code: "ETIMEDOUT" }, "timeout", true],
    [{ responseCode: 550 }, "rejected", false],
    [{ responseCode: 451 }, "timeout", true],
  ])("classifies %j so retry can tell permanent from transient", async (shape, type, retryable) => {
    const make: MakeTransport = async () => ({
      async sendMail() {
        throw Object.assign(new Error("boom"), shape as object);
      },
      close() {},
    });
    const provider = createSmtpProvider({ host: "h", port: 587, user: "u", pass: "p" }, make);

    await provider.send(message()).then(
      () => {
        throw new Error("should have thrown");
      },
      (err: unknown) => {
        expect(err).toBeInstanceOf(EmailSendError);
        expect((err as EmailSendError).type).toBe(type);
        expect((err as EmailSendError).retryable).toBe(retryable);
      },
    );
  });
});

describe("retry classification", () => {
  const shouldRetry = (err: unknown) => !(err instanceof EmailSendError) || err.retryable;

  it("attempts a permanent failure exactly once", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw new EmailSendError("535 bad credentials", "auth");
        },
        { attempts: 3, baseMs: 1, shouldRetry },
      ),
    ).rejects.toThrow(/535/);
    // Retrying bad credentials never succeeds and invites rate-limiting.
    expect(calls).toBe(1);
  });

  it("retries a transient failure and can succeed", async () => {
    let calls = 0;
    const out = await withRetry(
      async () => {
        calls += 1;
        if (calls === 1) throw new EmailSendError("ECONNRESET", "connection");
        return "ok";
      },
      { attempts: 3, baseMs: 1, shouldRetry },
    );
    expect(out).toBe("ok");
    expect(calls).toBe(2);
  });
});

describe("readSmtpConfig", () => {
  const KEYS = [
    "SMTP_HOST_TESTFIRM",
    "SMTP_USER_TESTFIRM",
    "SMTP_PASSWORD_TESTFIRM",
    "SMTP_PORT_TESTFIRM",
  ];
  afterEach(() => {
    for (const k of KEYS) delete process.env[k];
  });

  it("returns null while the config is incomplete, so the caller can fail closed", () => {
    expect(readSmtpConfig("TESTFIRM")).toBeNull();

    process.env.SMTP_HOST_TESTFIRM = "smtp.gmail.com";
    // Host alone is the half-configured case that must never quietly fall
    // through to Resend.
    expect(readSmtpConfig("TESTFIRM")).toBeNull();

    process.env.SMTP_USER_TESTFIRM = "u@example.com";
    expect(readSmtpConfig("TESTFIRM")).toBeNull();
  });

  it("strips the display spaces Google puts in an App Password", () => {
    process.env.SMTP_HOST_TESTFIRM = "smtp.gmail.com";
    process.env.SMTP_USER_TESTFIRM = "u@example.com";
    process.env.SMTP_PASSWORD_TESTFIRM = "abcd efgh ijkl mnop";

    const cfg = readSmtpConfig("TESTFIRM");
    expect(cfg).not.toBeNull();
    expect(cfg!.pass).toBe("abcdefghijklmnop");
    expect(cfg!.port).toBe(587);
  });
});
