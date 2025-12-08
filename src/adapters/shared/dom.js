/**
 * Shared DOM helpers used by adapters
 */

export const isHTMLElement = (value) =>
  typeof HTMLElement !== "undefined" && value instanceof HTMLElement;
