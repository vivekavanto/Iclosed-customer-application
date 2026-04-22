/**
 * Renders an email template from the database by replacing
 * {{ placeholder }} tokens with actual values, then wraps
 * the result in the same format used by the admin panel.
 *
 * Handles both `{{ var }}` (with spaces) and `{{var}}` (without).
 */

const LOGO_URL = "https://iclosed-admin-panel.vercel.app/logo.png";

/**
 * Replaces `{{ key }}` tokens (spaces optional) with their values.
 * Returns plain text with no HTML wrapping — safe for subjects.
 */
export function interpolateTokens(
  input: string,
  variables: Record<string, string>,
): string {
  let out = input;
  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\{\\{\\s*${escapeRegex(key)}\\s*\\}\\}`, "g");
    out = out.replace(pattern, value ?? "");
  }
  return out;
}

/**
 * Resolves the email subject from a DB template row.
 * Priority: template.subject → template.name → fallback.
 * Trims and treats empty strings as missing. Interpolates placeholders.
 * When falling back to `name`, strips a trailing "Email" token
 * (e.g. "Welcome Email" → "Welcome") since the name column is an
 * internal label, not a customer-facing subject.
 * Output is plain text only.
 */
export function resolveTemplateSubject(
  template: { subject?: string | null; name?: string | null } | null | undefined,
  variables: Record<string, string>,
  fallback: string,
): string {
  const subj = template?.subject?.trim();
  const name = template?.name?.trim();

  let raw: string;
  if (subj) {
    raw = subj;
  } else if (name) {
    raw = name.replace(/\s*[-–—:]*\s*Email\s*$/i, "").trim() || name;
  } else {
    raw = fallback;
  }

  return interpolateTokens(raw, variables).trim();
}

export function renderMilestoneTemplate(
  templateBody: string,
  variables: Record<string, string>
): string {
  const rendered = interpolateTokens(templateBody, variables);

  // Strip any existing full HTML wrapper — use only the inner content
  const bodyContent = extractBodyContent(rendered);

  return `<div>${bodyContent}<br>
<img src="${LOGO_URL}" alt="iClosed by Nava Wilson" style="width:70px;height:auto;" /></div>`;
}

/**
 * If the template already has a full HTML document, extract just the <body> content.
 * If it's plain text, convert newlines to <br>.
 */
function extractBodyContent(html: string): string {
  const hasDoctype = /<!DOCTYPE/i.test(html) || /<html/i.test(html);

  if (hasDoctype) {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
      return bodyMatch[1].trim();
    }
    return html
      .replace(/<\/?(!DOCTYPE|html|head|meta|body)[^>]*>/gi, "")
      .trim();
  }

  const hasHtml = /<[a-z][\s\S]*>/i.test(html);
  if (!hasHtml) {
    return html.replace(/\n/g, "<br>");
  }

  return html;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
