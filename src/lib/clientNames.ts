import supabaseAdmin from "./supabaseAdmin";

export interface NameAlias {
  first_name: string;
  last_name: string;
  added_at: string;
  added_by: string;
  reason: string | null;
}

export interface ClientNameRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  name_aliases: NameAlias[] | null;
  merged_into_client_id: string | null;
}

const norm = (s: string | null | undefined) =>
  (s ?? "").trim().toLowerCase();

export function aliasMatches(
  alias: { first_name?: string | null; last_name?: string | null },
  first: string,
  last: string
): boolean {
  return (
    norm(alias.first_name) === norm(first) &&
    norm(alias.last_name) === norm(last)
  );
}

export function nameMatchesClient(
  client: Pick<ClientNameRow, "first_name" | "last_name" | "name_aliases">,
  first: string,
  last: string
): boolean {
  if (!first.trim() && !last.trim()) return false;
  if (aliasMatches({ first_name: client.first_name, last_name: client.last_name }, first, last)) {
    return true;
  }
  const aliases = Array.isArray(client.name_aliases) ? client.name_aliases : [];
  return aliases.some((a) => aliasMatches(a, first, last));
}

export function buildAliasEntry(
  first_name: string,
  last_name: string,
  added_by: string,
  reason: string | null = null
): NameAlias {
  return {
    first_name: (first_name ?? "").trim(),
    last_name: (last_name ?? "").trim(),
    added_at: new Date().toISOString(),
    added_by,
    reason,
  };
}

export function dedupeAliases(aliases: NameAlias[]): NameAlias[] {
  const seen = new Set<string>();
  const out: NameAlias[] = [];
  for (const a of aliases) {
    const key = `${norm(a.first_name)}|${norm(a.last_name)}`;
    if (!key || key === "|" || seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

export async function followMergedClient(
  clientId: string,
  maxHops = 5
): Promise<ClientNameRow | null> {
  let currentId: string | null = clientId;
  for (let i = 0; i < maxHops && currentId; i++) {
    const { data, error }: { data: ClientNameRow | null; error: unknown } =
      await supabaseAdmin
        .from("clients")
        .select("id, first_name, last_name, name_aliases, merged_into_client_id")
        .eq("id", currentId)
        .maybeSingle();
    if (error || !data) return null;
    if (!data.merged_into_client_id) return data;
    currentId = data.merged_into_client_id;
  }
  return null;
}

export async function findClientByName(
  first: string,
  last: string
): Promise<ClientNameRow | null> {
  const fn = first.trim();
  const ln = last.trim();
  if (!fn && !ln) return null;

  const { data: primaryHits } = await supabaseAdmin
    .from("clients")
    .select("id, first_name, last_name, name_aliases, merged_into_client_id")
    .ilike("first_name", fn)
    .ilike("last_name", ln)
    .is("merged_into_client_id", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (primaryHits && primaryHits.length > 0) {
    return primaryHits[0] as ClientNameRow;
  }

  const aliasFilter = JSON.stringify([
    { first_name: fn, last_name: ln },
  ]);
  const { data: aliasHits } = await supabaseAdmin
    .from("clients")
    .select("id, first_name, last_name, name_aliases, merged_into_client_id")
    .filter("name_aliases", "cs", aliasFilter)
    .order("created_at", { ascending: false })
    .limit(5);

  if (!aliasHits || aliasHits.length === 0) return null;

  const exact = aliasHits.find((c) =>
    Array.isArray(c.name_aliases) &&
    (c.name_aliases as NameAlias[]).some((a) => aliasMatches(a, fn, ln))
  ) as ClientNameRow | undefined;

  if (!exact) return null;
  if (exact.merged_into_client_id) {
    return await followMergedClient(exact.merged_into_client_id);
  }
  return exact;
}

export async function appendAliasIfNew(
  clientId: string,
  alias: NameAlias
): Promise<void> {
  const { data } = await supabaseAdmin
    .from("clients")
    .select("name_aliases")
    .eq("id", clientId)
    .maybeSingle();
  const existing = Array.isArray(data?.name_aliases)
    ? (data!.name_aliases as NameAlias[])
    : [];
  if (existing.some((a) => aliasMatches(a, alias.first_name, alias.last_name))) {
    return;
  }
  const next = dedupeAliases([...existing, alias]);
  await supabaseAdmin
    .from("clients")
    .update({ name_aliases: next })
    .eq("id", clientId);
}

export async function renameClient(params: {
  clientId: string;
  newFirstName: string;
  newLastName: string;
  addedBy: string;
  reason?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { clientId, newFirstName, newLastName, addedBy, reason = null } = params;

  const { data: current, error: readErr } = await supabaseAdmin
    .from("clients")
    .select("id, first_name, last_name, name_aliases, merged_into_client_id")
    .eq("id", clientId)
    .maybeSingle();

  if (readErr || !current) {
    return { ok: false, error: "Client not found" };
  }
  if (current.merged_into_client_id) {
    return { ok: false, error: "Client has been merged; rename the primary instead" };
  }

  const trimmedFirst = (newFirstName ?? "").trim();
  const trimmedLast = (newLastName ?? "").trim();
  if (!trimmedFirst && !trimmedLast) {
    return { ok: false, error: "Name cannot be empty" };
  }

  const sameAsCurrent =
    norm(current.first_name) === norm(trimmedFirst) &&
    norm(current.last_name) === norm(trimmedLast);
  if (sameAsCurrent) {
    return { ok: true };
  }

  const aliases = Array.isArray(current.name_aliases)
    ? (current.name_aliases as NameAlias[])
    : [];

  const previous = buildAliasEntry(
    current.first_name ?? "",
    current.last_name ?? "",
    addedBy,
    reason
  );
  const hasOldName = previous.first_name || previous.last_name;
  const nextAliases = hasOldName
    ? dedupeAliases([...aliases, previous])
    : aliases;

  const { error: updErr } = await supabaseAdmin
    .from("clients")
    .update({
      first_name: trimmedFirst,
      last_name: trimmedLast,
      name_aliases: nextAliases,
    })
    .eq("id", clientId);

  if (updErr) return { ok: false, error: updErr.message };
  return { ok: true };
}
