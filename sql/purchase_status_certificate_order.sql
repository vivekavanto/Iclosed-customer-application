-- Purchase task order: ILA after ownership, Status Certificate after ID. Idempotent.
UPDATE task_templates t
SET order_index = v.ord
FROM (VALUES
  ('%agreement of purchase%', 1),
  ('%personal information%', 2),
  ('%ownership shares%', 3),
  ('independent legal advice%', 4),
  ('identification%', 5),
  ('%treefort%', 6),
  ('%status certificate%', 7),
  ('%mortgage representative%', 8),
  ('%solicitor information%', 9),
  ('%void cheque%', 10),
  ('%home insurance%', 11),
  ('%signing appointment%', 12),
  ('%deposit funds%', 13),
  ('%utilities%', 14)
) AS v(pattern, ord)
WHERE t.lead_type = 'Purchase'
  AND t.is_deleted = false
  AND t.name ILIKE v.pattern;
