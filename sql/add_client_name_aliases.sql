-- Consolidate users under one primary ID by storing a list of historical names
-- on the clients row. Lookups (getAuthClient, intake, convertLead) become
-- alias-aware so a returning person under a former name still resolves to the
-- same clients.id.
--
-- merged_into_client_id is set when an admin merges a duplicate client into a
-- primary one. The secondary row stays for audit; resolvers redirect to the
-- primary.
--
-- Apply once in the Supabase SQL editor.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS name_aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS merged_into_client_id UUID NULL REFERENCES clients(id);

CREATE INDEX IF NOT EXISTS clients_name_aliases_gin
  ON clients USING gin (name_aliases jsonb_path_ops);

CREATE INDEX IF NOT EXISTS clients_merged_into_client_id_idx
  ON clients (merged_into_client_id)
  WHERE merged_into_client_id IS NOT NULL;
