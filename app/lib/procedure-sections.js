// Секциите на детайла на процедурата — показват се ПОСЛЕДОВАТЕЛНО в един вертикален
// скрол (без табове). `key` съвпада със старите initialTab стойности (за backward
// compat при отваряне от бутон „Документи" и др.). `id` е anchor за бърза навигация.
export const PROCEDURE_SECTIONS = [
  { key: "overview",  id: "procedure-overview",   icon: "info",     label: "Обзор" },
  { key: "eligible",  id: "procedure-applicants", icon: "users",    label: "Допустими кандидати" },
  { key: "funding",   id: "procedure-financing",  icon: "euro",     label: "Финансиране" },
  { key: "deadlines", id: "procedure-deadlines",  icon: "clock",    label: "Срокове" },
  { key: "documents", id: "procedure-documents",  icon: "document", label: "Документи" },
  { key: "sources",   id: "procedure-sources",    icon: "external", label: "Официални източници" },
];

// Стар initialTab / ?tab= → id на секция (за scroll при отваряне). Непознат → null.
export function sectionIdForTab(tab) {
  const s = PROCEDURE_SECTIONS.find((x) => x.key === tab);
  return s ? s.id : null;
}

// Подредба на документите: първо основните условия/обявление (насоки, условия,
// announcement), после по най-нова дата, накрая приложенията. Стабилна (не мутира входа).
const PRIMARY_RE = /насок|услови|обявл|покан|announc|guideline|call|nolikum|regulament|заповед/i;
function docRank(d) {
  const s = `${d.doc_type || ""} ${d.title || ""}`;
  if (PRIMARY_RE.test(s)) return 0;
  if (/прилож|annex|attachment|pielikum/i.test(s)) return 2;
  return 1;
}
function docTime(d) {
  const t = Date.parse(d.updated_at || d.published_at || d.created_at || "");
  return Number.isNaN(t) ? 0 : t;
}
export function sortDocuments(docs) {
  return [...(docs || [])].sort((a, b) => (docRank(a) - docRank(b)) || (docTime(b) - docTime(a)));
}
