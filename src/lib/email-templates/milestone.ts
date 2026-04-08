/**
 * Renders an email template from the database by replacing
 * {{ placeholder }} tokens with actual values, then wraps
 * the result in the same format used by the admin panel.
 *
 * Handles both `{{ var }}` (with spaces) and `{{var}}` (without).
 */

const LOGO_URL = "https://iclosed-admin-panel.vercel.app/logo.png";

export function renderMilestoneTemplate(
  templateBody: string,
  variables: Record<string, string>
): string {
  let rendered = templateBody;

  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\{\\{\\s*${escapeRegex(key)}\\s*\\}\\}`, "g");
    rendered = rendered.replace(pattern, value ?? "");
  }

  // Strip any existing full HTML wrapper — use only the inner content
  const bodyContent = extractBodyContent(rendered);

  return `<div>${bodyContent}<img src="${LOGO_URL}" alt="iClosed by Nava Wilson" style="width:70px;height:auto;" /></div>`;
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
