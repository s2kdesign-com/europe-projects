-- ?1 = database country (GR for rotation EL), ?2 = UTC as-of instant, ?3 = 7/14/30.
WITH change_times AS (
 SELECT project_id, MAX(datetime(changed_at)) AS changed_at
 FROM project_change_history WHERE country_code = ?1 GROUP BY project_id
), candidate AS (
 SELECT p.id, p.name AS title, p.country_code, p.status, p.deadline,
   p.deadline_date, p.budget, p.eligible AS applicants, p.original_language,
   p.official_url AS source_url, r.public_slug,
   COALESCE(datetime(p.first_seen_at),datetime(p.first_seen)) AS first_seen,
   MAX(COALESCE(datetime(p.last_updated),'0001-01-01'),
       COALESCE(datetime(p.first_seen_at),datetime(p.first_seen),'0001-01-01'),
       COALESCE(c.changed_at,'0001-01-01')) AS change_time
 FROM projects p JOIN public_projects r ON r.id = p.id
 LEFT JOIN change_times c ON c.project_id = p.id
 WHERE p.country_code = ?1
)
SELECT *, CASE WHEN first_seen >= datetime(?2, '-' || ?3 || ' days') THEN 1 ELSE 0 END AS is_new
FROM candidate
WHERE change_time >= datetime(?2, '-' || ?3 || ' days') AND change_time <= datetime(?2)
ORDER BY change_time DESC, id;
