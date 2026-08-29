/**
 * Turns a raw PDF field name (however the source document happened to name
 * it -- snake_case, camelCase, kebab-case, screaming case, ...) into
 * something a signer can actually read, e.g. "tenant_full_name" ->
 * "Applicant Full Name". Best-effort: a name that doesn't match any of these
 * conventions is returned as-is rather than mangled.
 */
export const humanizeFieldName = (name: string): string => {
  if (!name) return name;
  const spaced = name
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  if (!spaced) return name;
  return spaced
    .split(" ")
    .map((word) =>
      word.length === 0
        ? word
        : word[0].toUpperCase() + word.slice(1).toLowerCase()
    )
    .join(" ");
};
