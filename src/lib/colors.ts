/**
 * Recipient color palette. Index-based (not id-based) so a party's color
 * stays stable as long as its position in the roster order doesn't change,
 * and wraps once the roster grows past the token count -- callers never
 * need to branch on roster size themselves.
 *
 * Tokens live in `theme.css` (`--recipient-1` .. `--recipient-${RECIPIENT_COLOR_COUNT}`),
 * defined in both the light and dark blocks.
 */

/** Number of distinct recipient color tokens defined in theme.css. */
export const RECIPIENT_COLOR_COUNT = 6;

/**
 * Resolves the CSS custom property for a roster position, wrapping around
 * once `index` exceeds `RECIPIENT_COLOR_COUNT`. `index` is 0-based; the
 * token names themselves are 1-based (`--recipient-1`, not `--recipient-0`).
 *
 * Negative indices wrap the same way (e.g. -1 resolves to the last color),
 * matching JS's usual modulo pitfall being handled rather than ignored.
 */
export const recipientColorVar = (index: number): string => {
  const normalized =
    ((index % RECIPIENT_COLOR_COUNT) + RECIPIENT_COLOR_COUNT) %
    RECIPIENT_COLOR_COUNT;
  return `var(--recipient-${normalized + 1})`;
};
