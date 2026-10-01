-- Fills empty deal deposits from the lead or its APS. Idempotent.

UPDATE deals d
SET deposit_amount = COALESCE(
  l.deposit_amount,
  NULLIF(regexp_replace(l.aps_extraction #>> '{purchase,result,deposit,value}', '[^0-9.]', '', 'g'), '')::numeric
)
FROM leads l
WHERE l.id = d.lead_id
  AND d.deposit_amount IS NULL
  AND d.is_deleted = false
  AND lower(trim(coalesce(l.lead_type, ''))) <> 'sale'
  AND COALESCE(
    l.deposit_amount,
    NULLIF(regexp_replace(l.aps_extraction #>> '{purchase,result,deposit,value}', '[^0-9.]', '', 'g'), '')::numeric
  ) > 0;
