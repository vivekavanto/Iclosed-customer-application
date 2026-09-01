-- Read-only. Any row with applied = false still needs its script run.

SELECT 'add_personal_info_unit_field' AS migration, EXISTS (
  SELECT 1 FROM task_form_fields WHERE label ILIKE '%unit%apartment%'
) AS applied
UNION ALL SELECT 'add_tax_bill_payment_question', EXISTS (
  SELECT 1 FROM task_form_fields WHERE label ILIKE '%paid your tax bill%'
)
UNION ALL SELECT 'add_property_tax_proof_of_payment_doc_type', EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conname = 'lead_corporate_docs_doc_type_check'
    AND pg_get_constraintdef(oid) ILIKE '%property_tax_proof_of_payment%'
)
UNION ALL SELECT 'add_hold_title_and_signing_notices', EXISTS (
  SELECT 1 FROM task_form_fields
  WHERE label = 'How would you like to hold title: joint vs tenants in common?'
) AND EXISTS (
  SELECT 1 FROM task_form_fields WHERE label = 'Virtual signing fee notice'
)
UNION ALL SELECT 'update_hold_title_note_to_badge', EXISTS (
  SELECT 1 FROM task_form_fields
  WHERE label = 'Understanding Joint Tenants vs Tenants in Common'
    AND options ->> 'display' = 'badge'
)
UNION ALL SELECT 'set_source_of_funds_to_text', NOT EXISTS (
  SELECT 1 FROM task_form_fields
  WHERE label ILIKE '%source of funds%' AND field_type = 'textarea'
)
UNION ALL SELECT 'purchase_mail_forwarding_same_as_property', EXISTS (
  SELECT 1 FROM task_form_fields
  WHERE label ILIKE '%mail address same as purchase property%'
)
UNION ALL SELECT 'mail_forwarding_help_badge', EXISTS (
  SELECT 1 FROM task_form_fields
  WHERE label ILIKE '%mail forwarding address%' AND options ->> 'display' = 'badge'
)
-- NOT EXISTS also reads true if the old options were never there — confirm with
-- check_prod_marital_options.sql before trusting it.
UNION ALL SELECT 'purchase_marital_status_single_separated', NOT EXISTS (
  SELECT 1 FROM task_form_fields f
  JOIN task_templates t ON t.id = f.task_template_id
  WHERE f.label ILIKE '%marital%'
    AND lower(trim(t.lead_type)) = 'purchase'
    AND t.is_deleted = false
    AND f.options::text ILIKE '%separated_formal%'
)
UNION ALL SELECT 'add_ownership_shares_field', EXISTS (
  SELECT 1 FROM task_form_fields WHERE field_type = 'shares'
)
UNION ALL SELECT 'sale_personal_info_remove_questions', NOT EXISTS (
  SELECT 1 FROM task_form_fields f
  JOIN task_templates t ON t.id = f.task_template_id
  WHERE lower(trim(t.lead_type)) = 'sale'
    AND t.name ILIKE '%personal info%'
    AND t.is_deleted = false
    AND (f.label ILIKE '%occupation%' OR f.label ILIKE '%ever owned%'
         OR f.label ILIKE '%183%' OR f.label ILIKE '%employer%'
         OR f.label ILIKE '%source of funds%')
)

-- ── Schema-level migrations the checks above never covered ───────────────────
UNION ALL SELECT 'add_lead_closing_date', (
  SELECT count(*) = 2 FROM information_schema.columns
  WHERE table_name = 'leads'
    AND column_name IN ('closing_date', 'selling_closing_date')
)
UNION ALL SELECT 'add_deal_selling_closing_date', EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'deals' AND column_name = 'selling_closing_date'
)
UNION ALL SELECT 'add_lead_aps_extraction', EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'leads' AND column_name = 'aps_extraction'
)
-- Both halves must hold: the doc_type the upload saves under, and the field
-- itself on at least one Personal Information template.
UNION ALL SELECT 'add_separation_agreement_upload', EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conname = 'lead_corporate_docs_doc_type_check'
    AND pg_get_constraintdef(oid) ILIKE '%separation_agreement%'
) AND EXISTS (
  SELECT 1 FROM task_form_fields
  WHERE options ->> 'doc_type' = 'separation_agreement'
)
UNION ALL SELECT 'add_aps_multiple_files', EXISTS (
  SELECT 1 FROM task_form_fields
  WHERE field_type = 'file' AND options ->> 'multiple' = 'true'
    AND (options ->> 'doc_type' = 'aps' OR label ILIKE '%agreement of purchase%')
)
UNION ALL SELECT 'create_calculator_estimates', EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'calculator_estimates'
);
