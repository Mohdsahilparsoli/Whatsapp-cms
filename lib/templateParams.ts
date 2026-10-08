/**
 * Placeholder handling shared by the server and the browser (no "server-only"
 * on purpose — the Templates/Bulk Sender previews use it too).
 *
 * Two formats, matching Meta's `parameter_format`:
 *   positional → {{1}}, {{2}} …   values are matched by number
 *   named      → {{first_name}} …  values are matched by the name's position
 *                                 in the template's `variables` list
 */
export type ParameterFormat = "positional" | "named";

export const NAMED_PARAM_PATTERN = /^[a-z][a-z0-9_]*$/;

/** Placeholder tokens in `text`, unique, in order of first appearance. */
export function extractParams(text: string | null | undefined): string[] {
  const seen = new Set<string>();
  for (const match of (text ?? "").matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)) seen.add(match[1]);
  return [...seen];
}

/** Replaces every placeholder in `text` that has a non-empty value. */
export function fillParams(
  text: string,
  values: string[],
  format: ParameterFormat = "positional",
  names: string[] = []
): string {
  return text.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (match, token: string) => {
    const index = format === "named" ? names.indexOf(token) : Number(token) - 1;
    if (!Number.isInteger(index) || index < 0) return match;
    const value = values[index];
    return value && value.trim() ? value : match;
  });
}
