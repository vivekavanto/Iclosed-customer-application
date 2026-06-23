/**
 * Shared validation for Canadian address fields used across the intake form
 * (Step2 / Step3). Kept in one place so both steps validate identically.
 *
 * Each validator returns an error message string, or `null` when the value is
 * valid.
 */

// City: letters (including French accents À-ÖØ-öø-ÿ), spaces, hyphens,
// apostrophes (straight ' and curly ’), and periods. This accepts real
// Canadian place names such as "St. Catharines", "St.Catharines",
// "Saint-Jean-sur-Richelieu", "St. John's", and "Montréal", while still
// rejecting digits and stray symbols. The leading look-ahead requires at
// least one letter so punctuation-only input is rejected.
const CITY_REGEX = /^(?=.*[A-Za-zÀ-ÖØ-öø-ÿ])[A-Za-zÀ-ÖØ-öø-ÿ\s.'’-]+$/;

export function validateCity(raw: string): string | null {
  const city = raw.trim();
  if (!city) return "City is required.";
  if (!CITY_REGEX.test(city)) return "City name is not valid.";
  if (city.length < 2) return "City name is too short.";
  return null;
}

// Canadian postal code: a full "A1A 1A1" (the space/hyphen is optional) or the
// 3-character FSA on its own ("A1A"). Uses Canada Post's valid letter sets —
// the first letter never uses D, F, I, O, Q, U, W or Z; the remaining letters
// never use D, F, I, O, Q or U.
const POSTAL_REGEX =
  /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]([\s-]?\d[ABCEGHJ-NPRSTV-Z]\d)?$/i;

export function validatePostalCode(raw: string): string | null {
  const postal = raw.trim();
  if (!postal) return "Postal code is required.";
  if (!POSTAL_REGEX.test(postal))
    return "Enter a valid postal code (e.g. M5V 3A8 or M5V).";
  return null;
}

// Unit / Apartment / Suite (optional): letters, numbers, spaces, #, - and /
// so values like "4B", "#12", "PH-2", and "Unit 3" all pass.
const UNIT_REGEX = /^[A-Za-z0-9#/\s-]+$/;

export function validateUnit(raw: string): string | null {
  const unit = raw.trim();
  if (!unit) return null; // optional
  if (!UNIT_REGEX.test(unit))
    return "Unit can only contain letters, numbers, spaces, #, -, or /.";
  if (unit.length > 10) return "Unit number is too long.";
  return null;
}

export function validateStreet(raw: string): string | null {
  if (!raw.trim()) return "Street address is required.";
  return null;
}
