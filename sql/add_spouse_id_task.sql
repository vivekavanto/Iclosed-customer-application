-- Spouse ID task (src/lib/spouseIdTask.ts). Run before deploying; idempotent.

-- ── 1. Spouse columns on tasks ───────────────────────────────────────────────
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS spouse_name text NULL,
  ADD COLUMN IF NOT EXISTS spouse_source_task_id uuid NULL REFERENCES tasks(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tasks_spouse_id_unique
  ON tasks (deal_id, coalesce(side, '_'), lower(spouse_name))
  WHERE spouse_name IS NOT NULL AND is_deleted = false;

-- ── 2. Scope spouse ID documents to their task ──────────────────────────────
ALTER TABLE lead_corporate_docs
  ADD COLUMN IF NOT EXISTS task_id uuid NULL REFERENCES tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS lead_corporate_docs_task_id_idx
  ON lead_corporate_docs (task_id)
  WHERE task_id IS NOT NULL;

-- ── 3. Allow the new doc_type ────────────────────────────────────────────────
DO $$
DECLARE vals text;
BEGIN
  SELECT string_agg(quote_literal(doc_type), ', ') INTO vals
  FROM (
    SELECT unnest(ARRAY[
      'Article of Incorporation', 'Corporation Profile',
      'Special Shareholder Agreement', 'Directors Resolution', 'Other',
      'aps', 'identification', 'home_insurance', 'mortgage', 'document',
      'aps_purchase', 'aps_sale', 'retainer_agreement', 'void_cheque',
      'property_tax_proof_of_payment', 'separation_agreement',
      'spouse_identification'
    ]) AS doc_type
    UNION
    SELECT DISTINCT doc_type FROM lead_corporate_docs WHERE doc_type IS NOT NULL
  ) s;

  EXECUTE 'ALTER TABLE lead_corporate_docs
             DROP CONSTRAINT IF EXISTS lead_corporate_docs_doc_type_check';
  EXECUTE format(
    'ALTER TABLE lead_corporate_docs
       ADD CONSTRAINT lead_corporate_docs_doc_type_check
       CHECK (doc_type = ANY (ARRAY[%s]::text[]))',
    vals);
END $$;

-- ── 4. Verify ────────────────────────────────────────────────────────────────
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE (table_name = 'tasks' AND column_name IN ('spouse_name', 'spouse_source_task_id'))
   OR (table_name = 'lead_corporate_docs' AND column_name = 'task_id');
