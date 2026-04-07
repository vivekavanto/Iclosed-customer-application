/**
 * Renders an email template from the database by replacing
 * {{ placeholder }} tokens with actual values.
 *
 * Handles both `{{ var }}` (with spaces) and `{{var}}` (without).
 * If the body is plain text (no HTML tags), wraps it in basic HTML.
 */
export function renderMilestoneTemplate(
  templateBody: string,
  variables: Record<string, string>
): string {
  let rendered = templateBody;

  for (const [key, value] of Object.entries(variables)) {
    // Match both {{ key }} and {{key}} (with flexible whitespace)
    const pattern = new RegExp(`\\{\\{\\s*${escapeRegex(key)}\\s*\\}\\}`, "g");
    rendered = rendered.replace(pattern, value ?? "");
  }

  const hasHtml = /<[a-z][\s\S]*>/i.test(rendered);
  const hasDoctype = /<!DOCTYPE/i.test(rendered) || /<html/i.test(rendered);

  if (!hasDoctype) {
    const bodyContent = !hasHtml ? rendered.replace(/\n/g, "<br>") : rendered;
    
    rendered = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#374151;font-size:16px;line-height:1.6;">
${bodyContent}
</body>
</html>`;
  }

  return rendered;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
