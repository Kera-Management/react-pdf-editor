/**
 * Turns a raw PDF field name (however the source document happened to name
 * it -- snake_case, camelCase, kebab-case, screaming case, ...) into
 * something a signer can actually read, e.g. "tenant_full_name" ->
 * "Applicant Full Name". Best-effort: a name that doesn't match any of these
 * conventions is returned as-is rather than mangled.
 */
export const humanizeFieldName = (name: string): string => {
  if (!name) return name;

  // XFA-style hierarchical names (e.g. Adobe LiveCycle/dynamic-XFA forms)
  // look like "form1[0].#subform[2].RFirstName[0]": everything before the
  // last "." is structural form/subform nesting, and every "[n]" suffix is
  // an AcroForm array index -- neither carries meaning for a signer. Reduce
  // to the leaf segment before humanizing. A flat name with no "." or "[n]"
  // is already its own leaf, so this is a no-op for the common case.
  const leaf = name
    .split(".")
    .pop()!
    .replace(/\[\d+\]$/, "")
    .replace(/^#/, "");
  const target = leaf || name;

  const spaced = target
    // Acronym-style boundary inside a run of capitals, e.g. "RFirstName" ->
    // "R FirstName". The lower->upper rule below only catches a boundary
    // where a lowercase/digit is immediately followed by an uppercase
    // letter, so two adjacent capitals (as XFA's abbreviated field prefixes
    // often produce) would otherwise stay glued together, worst case
    // yielding "R First Name" instead of "RFirst Name".
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
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

/**
 * The ONE rule for the name a person sees for a field: the host's
 * `fieldLabels` entry, else the PDF's display name (/TU), else `fallback`
 * (by default `humanizeFieldName`; a site may keep its own, e.g. build mode
 * shows the raw name). Keyed by field NAME. Display only: never use the
 * result for assignments, values, saving or data attributes.
 */
export const resolveFieldLabel = (
  name: string,
  {
    fieldLabels,
    displayName,
    fallback = humanizeFieldName,
  }: {
    fieldLabels?: Record<string, string>;
    displayName?: string;
    fallback?: (name: string) => string;
  } = {}
): string => {
  const override = fieldLabels?.[name]?.trim();
  if (override) return override;
  const fromPdf = displayName?.trim();
  if (fromPdf) return fromPdf;
  return fallback(name);
};
