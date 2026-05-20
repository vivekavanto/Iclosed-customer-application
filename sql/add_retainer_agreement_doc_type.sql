-- Allows 'retainer_agreement' as a valid doc_type on lead_corporate_docs.
--
-- Before this migration, /api/retainer/sign inserted rows with
-- doc_type='retainer_agreement' but the CHECK constraint on the column did
-- not include that value, so every insert was silently rejected by Postgres.
-- The retainer signature rows were saved fine, but no PDF row ever appeared
-- in lead_corporate_docs, even though blob upload + email both succeeded.
--
-- Apply once in the Supabase SQL editor.

ALTER TABLE lead_corporate_docs
  DROP CONSTRAINT IF EXISTS lead_corporate_docs_doc_type_check;

ALTER TABLE lead_corporate_docs
  ADD CONSTRAINT lead_corporate_docs_doc_type_check CHECK (
    doc_type = ANY (ARRAY[
      'Article of Incorporation'::text,
      'Corporation Profile'::text,
      'Special Shareholder Agreement'::text,
      'Directors Resolution'::text,
      'Other'::text,
      'aps'::text,
      'identification'::text,
      'home_insurance'::text,
      'mortgage'::text,
      'document'::text,
      'aps_purchase'::text,
      'aps_sale'::text,
      'retainer_agreement'::text
    ])
  );
