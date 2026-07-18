// Таксономии за профила (български). Използвани от формите и препоръките.

export const ORGANIZATION_TYPES = [
  { key: "micro", label: "Микропредприятие" },
  { key: "small", label: "Малко предприятие" },
  { key: "medium", label: "Средно предприятие" },
  { key: "large", label: "Голямо предприятие" },
  { key: "startup", label: "Стартъп" },
  { key: "ngo", label: "НПО / сдружение" },
  { key: "municipality", label: "Община" },
  { key: "public", label: "Публична институция" },
  { key: "school", label: "Училище / университет" },
  { key: "self", label: "Самонаето лице" },
];

export const ORG_SIZES = [
  { key: "micro", label: "Микро (до 9 заети)" },
  { key: "small", label: "Малко (10–49)" },
  { key: "medium", label: "Средно (50–249)" },
  { key: "large", label: "Голямо (250+)" },
];

export const EMPLOYEE_RANGES = [
  { key: "0-9", label: "0–9" },
  { key: "10-49", label: "10–49" },
  { key: "50-249", label: "50–249" },
  { key: "250+", label: "250+" },
];

// Оборотни диапазони — валутата е country-specific (НЕ hardcode-ната като лв.).
// Ключовете са стабилни; етикетът се генерира с валутата на избраната държава.
export function revenueRanges(currencyCode = "EUR") {
  const cur = currencyCode || "EUR";
  return [
    { key: "lt100k", label: `до 100 хил. ${cur}` },
    { key: "100k-1m", label: `100 хил. – 1 млн. ${cur}` },
    { key: "1m-5m", label: `1 – 5 млн. ${cur}` },
    { key: "gt5m", label: `над 5 млн. ${cur}` },
  ];
}
// Съвместимост (стар списък — BGN); новият код ползва revenueRanges(currency).
export const REVENUE_RANGES = revenueRanges("BGN");

export const SECTORS = [
  "Информационни технологии",
  "Производство",
  "Търговия",
  "Услуги",
  "Земеделие",
  "Туризъм",
  "Здравеопазване",
  "Образование",
  "Социални дейности",
  "Енергетика",
  "Строителство",
  "Транспорт и логистика",
  "Култура и творчески индустрии",
  "Наука и научни изследвания",
  "Околна среда",
];

export const REGIONS = [
  "Благоевград", "Бургас", "Варна", "Велико Търново", "Видин", "Враца", "Габрово",
  "Добрич", "Кърджали", "Кюстендил", "Ловеч", "Монтана", "Пазарджик", "Перник",
  "Плевен", "Пловдив", "Разград", "Русе", "Силистра", "Сливен", "Смолян",
  "София (град)", "София (област)", "Стара Загора", "Търговище", "Хасково", "Шумен", "Ямбол",
];

export const APPLICANT_TYPES = [
  { key: "youth", label: "Младежи / младежка заетост" },
  { key: "sme", label: "Малки и средни предприятия (МСП)" },
  { key: "large", label: "Големи предприятия" },
  { key: "ngo", label: "НПО / сдружения" },
  { key: "municipality", label: "Общини" },
  { key: "public", label: "Публични институции" },
  { key: "school", label: "Училища / университети" },
  { key: "startup", label: "Стартъпи" },
];

// Интереси (булеви полета в профила).
export const INTERESTS = [
  { key: "youth_employment_interest", label: "Младежка заетост" },
  { key: "training_interest", label: "Обучение и квалификация" },
  { key: "research_interest", label: "Научни изследвания" },
  { key: "innovation_interest", label: "Иновации" },
  { key: "digitalization_interest", label: "Дигитализация" },
  { key: "green_transition_interest", label: "Зелени технологии" },
];
