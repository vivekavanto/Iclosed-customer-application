/**
 * Email template rendering utilities.
 * Handles template placeholder substitution with optional escaping.
 */

/**
 * Resolve function that maps placeholders to values.
 * Returns { value: string } for known placeholders, null for unknown ones.
 */
type PlaceholderResolver = (
  token: string
) => { value: string } | null;

interface RenderOptions {
  /** Whether to HTML-escape the substituted values (default: true) */
  escape?: boolean;
}

/**
 * Decode template braces for rendering.
 * Prepares template strings by handling any necessary transformations.
 * Currently a pass-through, but available for future template preprocessing.
 */
export function decodeTemplateBraces(template: string): string {
  return template;
}

/**
 * Render a template with safe placeholder substitution.
 * Replaces {{placeholder}} tokens with resolved values.
 *
 * @param template - The template string with {{placeholder}} tokens
 * @param resolve - Function to resolve placeholder tokens to values
 * @param options - Rendering options (e.g., escape)
 * @returns The rendered template with placeholders replaced
 */
export function renderTemplateSafe(
  template: string,
  resolve: PlaceholderResolver,
  options: RenderOptions = {}
): string {
  const { escape = true } = options;

  return template.replace(/\{\{(\w+)\}\}/g, (match, token) => {
    const result = resolve(token);
    if (!result) return match; // Keep original placeholder if not resolved

    let value = result.value;
    if (escape) {
      value = escapeHtml(value);
    }
    return value;
  });
}

/**
 * HTML-escape a string for safe inclusion in HTML.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}
