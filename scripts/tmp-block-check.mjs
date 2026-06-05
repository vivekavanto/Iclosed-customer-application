import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(get("NEXT_PUBLIC_SUPABASE_URL"), get("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

// ── EDIT THESE to match exactly what you typed in the intake form ──
const input = {
  email: "test123@gmail.com",          // a DIFFERENT email than the deal owner
  address_street: "1222 Fewster Drive",
  address_unit: "",
  address_city: "Mississauga",
  address_postal_code: "L4W 1A1",
};
// ───────────────────────────────────────────────────────────────────

const normEmail = (input.email ?? "").trim().toLowerCase();
const normStreet = (input.address_street ?? "").trim().toLowerCase();
const normUnit = (input.address_unit ?? "").trim().toLowerCase().replace(/\s/g, "");
const normCity = (input.address_city ?? "").trim().toLowerCase();
const normPostal = (input.address_postal_code ?? "").trim().toLowerCase().replace(/\s/g, "");

const matchesAddress = (l) => {
  const lStreet = (l.address_street ?? "").trim().toLowerCase();
  const lUnit = (l.address_unit ?? "").trim().toLowerCase().replace(/\s/g, "");
  const lCity = (l.address_city ?? "").trim().toLowerCase();
  const lPostal = (l.address_postal_code ?? "").trim().toLowerCase().replace(/\s/g, "");
  return { lStreet, lUnit, lCity, lPostal,
    street: lStreet === normStreet, unit: lUnit === normUnit,
    city: lCity === normCity, postal: lPostal === normPostal };
};

console.log("\nINPUT (normalized):", { normEmail, normStreet, normUnit, normCity, normPostal });

// EXACT replica of the intake converted-deal block query
const { data: convertedMatches, error } = await sb
  .from("leads")
  .select("id, email, status, parent_lead_id, address_street, address_unit, address_city, address_postal_code")
  .eq("status", "Converted")
  .neq("email", normEmail)
  .is("parent_lead_id", null)
  .ilike("address_city", normCity);

if (error) { console.error("query error:", error.message); process.exit(1); }

console.log(`\nConverted primary leads in city "${normCity}" (different email): ${convertedMatches?.length ?? 0}`);
let blocked = false;
for (const l of convertedMatches ?? []) {
  const m = matchesAddress(l);
  const all = m.street && m.unit && m.city && m.postal;
  if (all) blocked = true;
  console.log("──────────────");
  console.log("  email :", l.email);
  console.log("  street:", JSON.stringify(l.address_street), "→", m.street);
  console.log("  unit  :", JSON.stringify(l.address_unit), "→", m.unit);
  console.log("  city  :", JSON.stringify(l.address_city), "→", m.city);
  console.log("  postal:", JSON.stringify(l.address_postal_code), "→", m.postal);
  console.log("  ALL MATCH →", all);
}

// Also: ALL converted leads on this street regardless of city filter, to catch
// a city-filter miss (e.g. city stored differently).
const { data: byStreet } = await sb
  .from("leads")
  .select("email, status, parent_lead_id, address_street, address_unit, address_city, address_postal_code")
  .eq("status", "Converted")
  .ilike("address_street", `%${normStreet}%`);
console.log(`\n[street-wide] Converted leads matching street ~"${normStreet}": ${byStreet?.length ?? 0}`);
for (const l of byStreet ?? []) {
  console.log("  ", JSON.stringify({ email: l.email, street: l.address_street, unit: l.address_unit, city: l.address_city, postal: l.address_postal_code, parent: l.parent_lead_id }));
}

console.log("\n==> WOULD BLOCK (409)?", blocked, "\n");
