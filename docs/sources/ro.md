# Източници — RO Румъния

Дата на проверката: 2026‑07‑18. Статус на connector: connector_in_progress.
Sources verified: **partial** (официалност потвърдена; технически формат — за уточняване).

## Официални портали (потвърдени, gov домейни)
- **MIPE — Ministerul Investițiilor și Proiectelor Europene — https://mfe.gov.ro/**
  Управляващ орган / централен хъб за фондовете на ЕС 2021‑2027.
- **Oportunități de Finanțare UE — https://oportunitati-ue.gov.ro/**
  Единна точка за достъп; изброява активните покани по оперативни програми.
  (EN: https://oportunitati-ue.gov.ro/en/)
- **MySMIS2021 / SMIS2021+ — https://mysmis2021.gov.ro/** (подаване на заявления;
  `resurse.mysmis2021.gov.ro` за ресурси). Отхвърля автоматизирани заявки.
- **fonduri‑ue.ro — https://www.fonduri-ue.ro/** — портал за периода 2014‑2020 (legacy).

## Управляващи органи
Управляващите органи по програмите (напр. Educație și Ocupare — PEO 2021‑2027 и др.)
се публикуват през секции на **mfe.gov.ro** (напр. `mfe.gov.ro/peo-21-27/`).

## Технически формат (наблюдения)
- `oportunitati-ue.gov.ro` връща празно съдържание при суров HTTP fetch → вероятно
  **client‑side rendered** (`requires_javascript=1`).
- `mysmis2021.gov.ro` връща „Request Rejected“ за ботове → bot‑protection.
- Не е потвърден публичен API/RSS/sitemap. Нужно е: (а) намиране на structured/search
  endpoint зад портала, или (б) официален open‑data канал, или (в) browser automation
  като последна възможност (спазвайки robots/условия).

## Покритие
Националните оперативни програми 2021‑2027 през единната точка за достъп
(oportunitati‑ue.gov.ro). Регионалните програми (POR/Regio по региони) може да изискват
отделни regional adapters — за проверка.

## Известни ограничения
- JS‑rendering + bot‑protection → суровият fetch не връща покани.
- robots.txt/условия — да се проверят преди какъвто и да е автоматизиран достъп.

## Parser подход (план)
1. Потвърди дали `oportunitati-ue.gov.ro` има вътрешен JSON/search endpoint (network
   inspection) или официален open‑data.
2. Ако не — server‑rendered алтернатива или browser automation (последна възможност).
3. Имплементирай `fetchCalls`/`fetchProgrammes`/`fetchProcedureDetails` в
   `src/ingestion/countries/ro/` през общия интерфейс.

## Update честота
За уточняване след connector; предполагаемо дневно/седмично според портала.

## Записи в регистъра
Източниците се seed‑ват в `funding_sources` с `verified=1` за официалността, но
`enabled=0` и `source_health='unknown'` докато connector‑ът не мине dry run + QA.
