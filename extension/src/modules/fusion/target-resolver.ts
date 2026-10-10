/**
 * Target Resolver for Point-and-Say Interaction.
 *
 * Resolves the actionable DOM element under the virtual cursor coordinates,
 * traverses nested child elements (e.g. icons inside buttons), filters out
 * hidden/disabled elements, and assesses consequence risk tiers.
 */
import type { ActionRiskLevel, CursorPosition, ResolvedTarget } from "@/shared/types";
export type { ResolvedTarget };

/** Interactive selectors considered valid actionable targets. */
const ACTIONABLE_SELECTOR = [
  "button",
  "a[href]",
  "input:not([type='hidden'])",
  "select",
  "textarea",
  "summary",
  "[role='button']",
  "[role='link']",
  "[role='checkbox']",
  "[role='radio']",
  "[role='switch']",
  "[role='tab']",
  "[role='menuitem']",
  "[role='combobox']",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

/** Keywords that signal destructive or financial high-consequence actions. */
const HIGH_RISK_KEYWORDS = [
  "delete",
  "remove",
  "erase",
  "discard",
  "destroy",
  "pay",
  "purchase",
  "buy",
  "checkout",
  "order",
  "transfer",
  "submit",
  "confirm order",
  "cancel subscription",
  "deactivate",
  "wipe",
  "मिटाओ",
  "हटाओ",
  "खरीदें",
  "भुगतान",
];

/**
 * Checks if an element is visible, non-disabled, and interactable.
 */
export function isElementActionable(el: HTMLElement): boolean {
  // Check disabled states
  if (el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true") {
    return false;
  }

  // Check hidden attributes
  if (el.hasAttribute("hidden") || el.getAttribute("aria-hidden") === "true") {
    return false;
  }

  // Check CSS visibility if available
  if (typeof window !== "undefined" && typeof window.getComputedStyle === "function") {
    try {
      const style = window.getComputedStyle(el);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        parseFloat(style.opacity || "1") === 0 ||
        style.pointerEvents === "none"
      ) {
        return false;
      }
    } catch {
      // Safe fallback in test environments
    }
  }

  // Check geometry
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/**
 * Classifies an element's action consequence risk level into low, moderate, or high.
 */
export function classifyTargetRisk(el: HTMLElement, explicitText?: string): ActionRiskLevel {
  const tagName = el.tagName.toLowerCase();
  const inputType = el.getAttribute("type")?.toLowerCase();
  const role = el.getAttribute("role")?.toLowerCase();

  // Explicit risk override attribute
  const dataRisk = el.getAttribute("data-risk")?.toLowerCase();
  if (dataRisk === "high" || dataRisk === "moderate" || dataRisk === "low") {
    return dataRisk as ActionRiskLevel;
  }

  // Check form submit buttons
  if (
    (tagName === "button" && inputType === "submit") ||
    (tagName === "input" && inputType === "submit")
  ) {
    return "high";
  }

  // Check keyword matches in text or labels
  const textContent = (explicitText ?? el.innerText ?? el.textContent ?? "").toLowerCase();
  const ariaLabel = (el.getAttribute("aria-label") ?? "").toLowerCase();
  const title = (el.getAttribute("title") ?? "").toLowerCase();
  const combined = `${textContent} ${ariaLabel} ${title}`;

  for (const keyword of HIGH_RISK_KEYWORDS) {
    if (combined.includes(keyword)) {
      return "high";
    }
  }

  // Moderate risk: links navigating to external pages or new tabs
  if (tagName === "a" || role === "link") {
    const href = el.getAttribute("href") ?? "";
    const target = el.getAttribute("target");
    if (target === "_blank" || href.startsWith("http") || href.startsWith("//")) {
      return "moderate";
    }
  }

  return "low";
}

/**
 * Resolves the actionable DOM element at the given viewport coordinates.
 * Climbs parent chain when hitting nested children (icons, spans, svgs).
 */
export function resolveTargetAtPoint(
  pos: CursorPosition,
  doc?: Document
): ResolvedTarget | null {
  const activeDoc = doc ?? (typeof document !== "undefined" ? document : null);
  if (!activeDoc || typeof activeDoc.elementFromPoint !== "function") {
    return null;
  }

  const rawElement = activeDoc.elementFromPoint(pos.x, pos.y);
  if (!rawElement || !(rawElement instanceof HTMLElement)) {
    return null;
  }

  // Ignore document body or root container
  if (rawElement === activeDoc.body || rawElement === activeDoc.documentElement) {
    return null;
  }

  // Check if raw element itself or an ancestor matches actionable selector
  let candidate: HTMLElement | null = rawElement.closest(ACTIONABLE_SELECTOR);

  // If closest didn't match, check if element has cursor pointer style or explicit click handler
  if (!candidate && typeof window !== "undefined" && typeof window.getComputedStyle === "function") {
    try {
      const style = window.getComputedStyle(rawElement);
      if (style.cursor === "pointer" && isElementActionable(rawElement)) {
        candidate = rawElement;
      }
    } catch {
      // Ignore
    }
  }

  if (!candidate || !isElementActionable(candidate)) {
    return null;
  }

  // Compute bounding rect
  const rect = candidate.getBoundingClientRect();
  const text = (candidate.innerText ?? candidate.textContent ?? "").trim().slice(0, 80);
  const ariaLabel = candidate.getAttribute("aria-label") ?? undefined;
  const role = candidate.getAttribute("role") ?? undefined;
  const href = candidate.getAttribute("href") ?? undefined;
  const type = candidate.getAttribute("type") ?? undefined;

  const risk = classifyTargetRisk(candidate, text);

  return {
    element: candidate,
    tagName: candidate.tagName.toLowerCase(),
    text,
    ariaLabel,
    role,
    href,
    type,
    isActionable: true,
    risk,
    rect: {
      top: Math.round(rect.top),
      left: Math.round(rect.left),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
  };
}

/**
 * Compares two ResolvedTarget instances for DOM identity.
 */
export function areTargetsEqual(
  a: ResolvedTarget | null,
  b: ResolvedTarget | null
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.element === b.element;
}
