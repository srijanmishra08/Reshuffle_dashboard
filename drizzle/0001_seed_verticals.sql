INSERT INTO "verticals" ("id", "org_id", "name", "description") VALUES
  ('vertical-fertiliser', 'default', 'Fertiliser', ''),
  ('vertical-dairy', 'default', 'Dairy', ''),
  ('vertical-fmcg', 'default', 'FMCG', ''),
  ('vertical-law', 'default', 'Law', ''),
  ('vertical-interior', 'default', 'Interior', ''),
  ('vertical-real-estate', 'default', 'Real Estate', ''),
  ('vertical-travel', 'default', 'Travel Agency', ''),
  ('vertical-rice-mill', 'default', 'Rice Mill', '')
ON CONFLICT DO NOTHING;
