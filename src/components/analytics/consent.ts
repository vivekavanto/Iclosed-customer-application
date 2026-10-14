export type ConsentChoice = "granted" | "denied";

const STORAGE_KEY = "cookie-consent";
export const CONSENT_EVENT = "cookie-consent-change";

export function readConsent(): ConsentChoice | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

export function saveConsent(choice: ConsentChoice): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // storage unavailable — choice only lasts for this page view
  }
  window.dispatchEvent(new Event(CONSENT_EVENT));
}
