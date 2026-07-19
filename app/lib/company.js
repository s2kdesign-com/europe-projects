// Единен източник за фирмените и правните данни. Използва се от всички правни
// страници и футъра — без hardcode на различни места. Тези стойности НЕ се
// превеждат (при бъдеща многоезичност идват директно от тук).
//
// Дата на правните документи: сменя се РЪЧНО само когато съдържанието реално се
// промени (не при всеки deployment).
export const COMPANY = {
  name: "S2K Design",
  legalName: "S2K Design ЕООД",
  website: "https://s2kdesign.com/",
  websiteLabel: "S2K Design",
  email: "office@s2kdesign.com",
  address: "гр. Пловдив, България",
  serviceName: "Euro-Funding",
  operator: "S2K Design ЕООД",
  legalDocumentVersion: "1.1",
  legalEffectiveDate: "17.07.2026",
  legalLastUpdated: "19.07.2026",
  // Технически логове за грешки — задавай реалната стойност само ако кодът я спазва.
  logRetention: "90 дни",
};
