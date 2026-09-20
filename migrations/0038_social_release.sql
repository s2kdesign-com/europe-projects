INSERT INTO changelog_entries(version,title,summary,content,category,published_at,affected_route,created_at,updated_at)
SELECT '2.60.0','Дневни публикации за финансиране по държави',
'Подготвена е система за публикации с реални данни и ротация на 27-те държави в ЕС.',
'["Публикациите използват актуални процедури, местен език и връзки към подробностите в платформата.","Историята в Cloudflare пази резултатите и предотвратява повторно изпращане. Изображенията се редуват с публикации с връзка.","Активирането на публикуването изисква настроен достъп до фирмените страници в LinkedIn и Facebook."]',
'feature','2026-09-20','/procedures',datetime('now'),datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM changelog_entries WHERE version='2.60.0');
