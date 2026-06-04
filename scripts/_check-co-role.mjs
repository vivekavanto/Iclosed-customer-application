import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: deals } = await sb
  .from("deals")
  .select("id, file_number, type, lead_id")
  .in("file_number", ["26PS-0049", "26PS-0050", "26PS-0051"]);

for (const d of deals ?? []) {
  const { data: lead } = await sb
    .from("leads")
    .select("id, first_name, last_name, lead_type, parent_lead_id, co_person_role, selling_address_street")
    .eq("id", d.lead_id)
    .maybeSingle();
  console.log(
    `${d.file_number} type="${d.type}" | lead=${lead?.first_name} ${lead?.last_name} lead_type="${lead?.lead_type}" parent=${lead?.parent_lead_id ? "child" : "PRIMARY"} co_person_role=${lead?.co_person_role ?? "NULL"} sellingStreet=${lead?.selling_address_street ?? "-"}`
  );
}
console.log("done");
