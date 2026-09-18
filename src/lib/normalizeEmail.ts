/**
 * The form an email address is STORED in.
 *
 * Intake used to write the address exactly as the client typed (or pasted) it,
 * while Supabase Auth trims the one it registers. A pasted "someone@example.com "
 * therefore produced a lead/client row that no lookup keyed on the auth identity
 * could ever find again — which is what silently killed the "your client just
 * signed up" notification to the referring agent: the admin app resolved neither
 * client nor lead, so the deal was never promoted off "Inactive" and the agent
 * email was held back forever, reporting success the whole way.
 *
 * Whitespace only: zero-width characters (a classic copy-paste passenger) are
 * dropped, non-breaking spaces are folded to ordinary ones, and the result is
 * trimmed. Case is LEFT ALONE — the local part is case-sensitive per RFC 5321,
 * and quietly lower-casing what someone typed is a change nobody asked for.
 * Comparisons that want case-insensitivity keep doing it at compare time.
 *
 * Returns null for an address that is empty once cleaned, so it can be handed
 * straight to a nullable column.
 */
export function normalizeEmailForStorage(
  email: string | null | undefined,
): string | null {
  const cleaned = (email ?? "")
    .replace(/[​-‍﻿]/g, "")
    .replace(/ /g, " ")
    .trim();
  return cleaned === "" ? null : cleaned;
}
