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
