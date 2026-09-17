-- Additive: projects is at D1's column limit. Routes survive content updates.
CREATE TABLE IF NOT EXISTS public_routes (
  kind TEXT NOT NULL CHECK(kind IN ('procedure','program')),
  entity_id TEXT NOT NULL,
  slug TEXT NOT NULL CHECK(length(slug)>0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(kind,entity_id), UNIQUE(kind,slug)
);
CREATE TABLE IF NOT EXISTS public_route_aliases (
  kind TEXT NOT NULL,
  alias TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  PRIMARY KEY(kind,alias),
  FOREIGN KEY(kind,entity_id) REFERENCES public_routes(kind,entity_id)
);
CREATE VIEW IF NOT EXISTS public_projects AS
SELECT p.id,p.name,p.program,p.priority,p.category,p.status,p.deadline,p.deadline_date,
  p.budget,p.budget_amount_eur,p.eligible,p.link,p.notes,p.is_new,p.first_seen,p.last_updated,
  p.year,p.country_code,p.official_url,p.managing_authority,p.original_language,p.source_id,
  r.slug AS public_slug, g.slug AS program_slug
FROM projects p
LEFT JOIN public_routes r ON r.kind='procedure' AND r.entity_id=p.id
LEFT JOIN public_routes g ON g.kind='program' AND g.entity_id=json_array(COALESCE(p.country_code,''),COALESCE(p.source_id,''),p.program);
