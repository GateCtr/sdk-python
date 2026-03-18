/**
 * Replaces {key} placeholders in a string with values from a vars map.
 * Used to inject PRODUCT constants into next-intl raw translation strings.
 */
export function interpolate(
  str: string,
  vars: Record<string, string | number>,
): string {
  return str.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? `{${key}}`));
}
