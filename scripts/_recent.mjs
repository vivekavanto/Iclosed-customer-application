import { createClient } from "@supabase/supabase-js";
const sb = createClient("https://awygszzpyotaddnspikt.supabase.co","eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3eWdzenpweW90YWRkbnNwaWt0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTkzOTEwMiwiZXhwIjoyMDk1NTE1MTAyfQ.MOD3380tBEz0JZvOsVB8wtrR1soUusMarDsQ3U6zxMU",{auth:{persistSession:false}});
// Leads created in the last ~3 hours
const { data } = await sb.from("leads")
  .select("id,email,first_name,last_name,status,welcome_email_sent,parent_lead_id,address_match_flag,address_street,address_unit,created_at")
  .gte("created_at","2026-06-02T07:30:00Z")
  .order("created_at",{ascending:true});
console.log(`Leads created since 07:30 UTC: ${data?.length}\n`);
for (const l of (data||[])) {
  console.log(`${l.created_at} | ${l.email} | "${l.first_name} ${l.last_name}" | status=${l.status} | welcome_sent=${l.welcome_email_sent} | parent=${l.parent_lead_id?'YES':'no'} | matchFlag=${l.address_match_flag?JSON.stringify(l.address_match_flag):'-'} | addr=${l.address_unit?l.address_unit+'-':''}${l.address_street}`);
}
