-- Allows 'property_tax_proof_of_payment' as a valid doc_type on lead_corporate_docs.
--
-- The "Proof of Payment" field added by add_tax_bill_payment_question.sql uploads
-- with doc_type='property_tax_proof_of_payment', but the CHECK constraint on the
-- column does not include that value, so the insert fails with
-- "violates check constraint lead_corporate_docs_doc_type_check".
--
-- The allowed list is built as: the known values below UNION every doc_type
-- already present in the table. Rebuilding from a fixed list alone fails with
-- "constraint is violated by some row" when legacy rows hold other values
-- (e.g. 'void_cheque'), so those are grandfathered in and reported via NOTICE.
--
-- Apply once in the Supabase SQL editor (dev and prod).

DO $$
DECLARE
  vals  text;
  extra text;
BEGIN
  -- Legacy values in the table but not in the known list (informational only).
  SELECT string_agg(DISTINCT quote_literal(doc_type), ', ') INTO extra
  FROM lead_corporate_docs
  WHERE doc_type IS NOT NULL
    AND doc_type NOT IN (
      'Article of Incorporation', 'Corporation Profile',
      'Special Shareholder Agreement', 'Directors Resolution', 'Other',
      'aps', 'identification', 'home_insurance', 'mortgage', 'document',
      'aps_purchase', 'aps_sale', 'retainer_agreement', 'void_cheque',
      'property_tax_proof_of_payment'
    );
  IF extra IS NOT NULL THEN
    RAISE NOTICE 'Grandfathering existing doc_type value(s): %', extra;
  END IF;

  SELECT string_agg(quote_literal(doc_type), ', ') INTO vals
  FROM (
    SELECT unnest(ARRAY[
      'Article of Incorporation', 'Corporation Profile',
      'Special Shareholder Agreement', 'Directors Resolution', 'Other',
      'aps', 'identification', 'home_insurance', 'mortgage', 'document',
      'aps_purchase', 'aps_sale', 'retainer_agreement', 'void_cheque',
      'property_tax_proof_of_payment'
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

-- Verify:
-- SELECT pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conname = 'lead_corporate_docs_doc_type_check';
