// CMP-002 — the privacy policy that the intake consent checkbox refers to.
//
// The intake form requires an affirmative tick before a client can submit their
// PII, and we store WHICH version they agreed to (`privacy_consent_version`) plus
// WHEN (`privacy_consent_at`). Bump the version string whenever the policy
// materially changes, so you can tell who consented to the old vs new policy and
// re-prompt if you need fresh consent.
export const PRIVACY_POLICY_VERSION = "2026-07-23";

// Where the "Privacy Policy" link in the consent checkbox points. Update this to
// your published policy URL (a relative path keeps it on this domain).
export const PRIVACY_POLICY_URL = "/privacy-policy";
