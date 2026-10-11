/**
 * Turns an AcroForm field name into a readable fallback label:
 * `form1[0].#subform[1].PayDate[0]` -> "Pay date". Only ever used as
 * synthetic text (a label or aria-label), never as document text.
 */
export function humanizeFieldName(name: string): string {
  const parts = name
    .split(".")
    .map((p) => p.replace(/\[\d+\]/g, "").trim())
    .filter((p) => p && !p.startsWith("#"));
  const last = parts.length ? parts[parts.length - 1] : name.replace(/\[\d+\]/g, "").trim();
  const words = last
    // "PayDate" -> "Pay Date", "SINNumber" -> "SIN Number", "Tenant2" -> "Tenant 2"
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  if (!words.length) return "Field";
  return words
    .map((w, i) => {
      // Keep acronyms ("SIN", "RTB") as written.
      if (w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w)) return w;
      const lower = w.toLowerCase();
      return i === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
    })
    .join(" ");
}
