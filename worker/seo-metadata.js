// Keep full source names and immutable identifiers in the page, not in snippets.
export function concise(value, limit) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  const head = Math.floor((limit - 3) * .7);
  return text.slice(0, head).trimEnd() + ' … ' + text.slice(-(limit - 3 - head)).trimStart();
}

function shortKey(value) {
  // Display-only discriminator for otherwise indistinguishable source records.
  let hash = 2166136261;
  for (const c of String(value)) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(36);
}

function uniqueLabel(record, peers, nameOf, keyOf, limit = 68) {
  const base = p => concise(nameOf(p), limit) + (p.country_code ? ` (${p.country_code})` : '');
  const same = peers.filter(p => base(p) === base(record));
  if (same.length < 2) return base(record);
  const context = p => concise(p.source_id || p.program || '', 18);
  const label = base(record) + ' · ' + context(record);
  return same.filter(p => context(p) === context(record)).length > 1
    ? label + ' · ' + shortKey(keyOf(record)) : label;
}

export function procedureMetadata(p, peers = [p]) {
  const label = uniqueLabel(p, peers, r => r.name, r => r.id);
  const detail = [p.program, p.deadline].filter(Boolean).join(' · ');
  return {
    title: label + ' | Euro-Funding',
    description: `${label}. ${concise(detail || 'Финансиране, допустими кандидати, документи и официални източници.', Math.max(50, 190 - label.length - 2))}`,
  };
}

export function programMetadata(p, peers) {
  const label = uniqueLabel(p, peers, r => r.program, r => r.program_slug, 58);
  return { title: 'Програма: ' + label + ' | Euro-Funding', description: `${label}. Процедури за финансиране: условия, срокове и официални източници.` };
}
