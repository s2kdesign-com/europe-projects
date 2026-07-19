"use client";

import LegalPage from "../components/LegalPage.jsx";
import Icon from "../components/Icon.jsx";
import { COMPANY } from "../lib/company.js";

const COOKIES = [
  { name: "evp_session", provider: COMPANY.name, purpose: "Поддържане на вход и сесия", type: "HttpOnly бисквитка", life: "30 дни", need: "Необходима", when: "При вход с Google" },
  { name: "evp_oauth", provider: COMPANY.name, purpose: "Временно състояние и сигурност по време на вход (OAuth)", type: "HttpOnly бисквитка", life: "≈ 10 минути", need: "Необходима", when: "По време на вход с Google" },
  { name: "evroproekti_cookie_consent", provider: COMPANY.name, purpose: "Запомня избора ви за бисквитки", type: "localStorage", life: "До изтриване", need: "Необходима", when: "След избор в банера" },
  { name: "Локални настройки и запазвания", provider: COMPANY.name, purpose: "Запазени процедури, изглед и предпочитания без вход", type: "localStorage", life: "До изтриване", need: "Функционална", when: "При ползване без профил" },
  { name: "_ga", provider: "Google (Google Analytics)", purpose: "Анонимна статистика за посещенията (различаване на потребители)", type: "Бисквитка", life: "До 2 години", need: "Аналитична", when: "Само след съгласие" },
  { name: "_ga_EDMN8Q86T6", provider: "Google (Google Analytics)", purpose: "Състояние на сесията за GA4", type: "Бисквитка", life: "До 2 години", need: "Аналитична", when: "Само след съгласие" },
];

export default function CookiesPage() {
  const openSettings = () => window.dispatchEvent(new CustomEvent("open-cookie-settings"));
  const sections = [
    { id: "what", h: "1. Какво са бисквитките", body: "Бисквитките и локалното хранилище (localStorage) са малки данни, съхранявани в браузъра ви. Използваме ги за работата на системата и, при съгласие, за подобряване на услугата." },
    {
      id: "used", h: "2. Какви използваме",
      body: (
        <div className="legal-table-wrap">
          <table className="legal-table">
            <thead>
              <tr><th scope="col">Име</th><th scope="col">Доставчик</th><th scope="col">Цел</th><th scope="col">Вид</th><th scope="col">Срок</th><th scope="col">Необходимост</th><th scope="col">Кога</th></tr>
            </thead>
            <tbody>
              {COOKIES.map((c) => (
                <tr key={c.name}>
                  <td data-label="Име"><code>{c.name}</code></td>
                  <td data-label="Доставчик">{c.provider}</td>
                  <td data-label="Цел">{c.purpose}</td>
                  <td data-label="Вид">{c.type}</td>
                  <td data-label="Срок">{c.life}</td>
                  <td data-label="Необходимост">{c.need}</td>
                  <td data-label="Кога">{c.when}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ),
    },
    { id: "necessary", h: "3. Необходими бисквитки", body: "Винаги активни. Осигуряват вход (сесия), сигурност, състояние на приложението и запазване на избора ви за бисквитки. Без тях услугата не може да работи коректно." },
    { id: "analytics", h: "4. Аналитични бисквитки", body: "Изключени по подразбиране чрез Google Consent Mode v2 (analytics_storage='denied'). Използваме Google Analytics 4 (идентификатор G-EDMN8Q86T6) за анонимна статистика на посещенията (с анонимизиран IP) — само след изрично съгласие през банера. До съгласие Google tag е зареден, но не пише бисквитки и не събира данни; при оттегляне на съгласието събирането спира." },
    { id: "marketing", h: "5. Маркетингови бисквитки", body: "Не използваме маркетингови или проследяващи бисквитки." },
    {
      id: "manage", h: "6. Управление на съгласието",
      body: "Можете да промените или оттеглите съгласието си по всяко време.",
      action: <button className="btn btn-primary" onClick={openSettings} style={{ marginTop: 8 }}><Icon name="filter" size={16} aria-hidden="true" /> Настройки на бисквитките</button>,
    },
  ];
  return (
    <LegalPage
      title="Политика за бисквитките"
      subtitle="Какви бисквитки използваме и как да управлявате съгласието си."
      effective={COMPANY.legalEffectiveDate}
      updated={COMPANY.legalLastUpdated}
      version={COMPANY.legalDocumentVersion}
      sections={sections}
    />
  );
}
