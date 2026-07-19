"use client";

import { useCallback, useEffect, useState } from "react";
import AccountHeader from "../components/AccountHeader.jsx";
import Icon from "../components/Icon.jsx";
import { GoogleG } from "../components/UserMenu.jsx";
import { useSession } from "../hooks/useSession.js";
import { APP_VERSION } from "../lib/version.js";
import AiModelsTab from "./AiModelsTab.jsx";
import { useUiTranslate, UiTrContext, useUiTr } from "../lib/i18n/ui-translate.js";

// Основните видими низове в администрацията — batch превод при чужд UI език.
const ADMIN_LABELS = [
  "Настройки · Администрация", "Системни настройки, потребители, журнал на грешките и сигнали.",
  "Система", "Източници", "AI модели", "Потребители", "Exceptions", "Сигнали", "Раздели",
  "Зареждане…", "Обнови", "Добави", "Редакция", "Изчисти", "Търсене…",
  "Всички държави", "Всички статуси", "Само активни", "Само неактивни", "Само проверени",
  "Непроверени", "Проблемни (health)", "Държава", "Източник", "Тип/Ниво", "Приор.",
  "Активен", "Посл. успех", "Предишна", "Следваща", "Няма източници по този филтър",
  "Променете филтрите или добавете нов източник.", "Системна информация", "Версия",
  "Влезли сте като", "Домейн", "Съхранение", "Общо процедури", "Отворени", "С документи",
  "Последно обновяване", "Многоезичност и превод", "База данни", "Роли",
  "Вход е необходим", "Настройките са достъпни само за администратори.",
  "Продължи с Google", "Към таблото", "Няма достъп",
  "Тази страница е само за администратори. Ако смятате, че това е грешка, свържете се с администратор.",
  // Система (останалите етикети)
  "Статус на превода", "Доставчик", "Поддържани езици", "Локация", "Речник (glossary)",
  "Кеширани преводи", "Езици в кеша", "активен", "неактивен", "включен", "изключен",
  "Запазени процедури", "Документи", "Записи в changelog",
  "Достъпът се управлява чрез роли:", "Потребител", "Премиум", "Администратор",
  // Потребители
  "Имейл", "Роля", "Регистриран", "Последен вход", "Ролята е обновена.", "Промяната не бе записана.",
  // Exceptions / Сигнали
  "Време", "Метод/Път", "Статус", "Съобщение", "Няма записани грешки",
  "Системата не е регистрирала грешки. Тук се събират сървърни и клиентски изключения.",
  "Да изчистя ли журнала с грешки?", "Тип", "Заглавие", "Описание", "Адрес / версия", "Няма сигнали",
  "Тук се показват подадените сигнали от потребителите (бутон „Подай сигнал за проблем“).",
  "Грешка", "Неточни данни", "Предложение",
  // Източници (форма)
  "Нов източник", "Име", "Орган (authority)", "Тип", "Ниво", "Език (код)", "Приоритет",
  "Покритие (описание)", "Проверен (verified)", "Активен (enabled — production sync)",
  "Основен източник", "Изисква JavaScript", "Добави източника", "Запази промените", "Отказ",
  "Добавяйте само официални източници (държавни портали и управляващи органи). „Активен“ включва източника в автоматичната синхронизация — само след проверка и QA.",
  // AI модели
  "AI модели", "Управление на AI доставчиците, моделите, дневните задачи и бъдещите AI функции на системата.",
  "Дневен преглед", "Системен AI анализ", "Преглед на документи", "Анализ на бюджети",
  "Персонализирани препоръки", "Бъдещ AI чат", "Модел", "Управление",
  "Управлява се от Claude Scheduled Tasks", "Последно изпълнение", "Реален модел (последен отчет)",
  "Валидация", "AI заявки днес", "Успешни", "Неуспешни", "Токени", "Средна латентност",
  "Няма налични данни", "Конфигуриран", "API ключът не е конфигуриран", "Връзка OK",
  "Грешка при връзка", "Ключ", "Последна смяна", "Последен тест", "Модели (кеш)",
  "Въведете нов API ключ", "Замени ключа", "Запази", "Провери връзката", "Премахни ключа",
  "Успешна връзка", "Активни AI модели", "Модел (display)", "Цена (~1M)", "Използван",
  "заявки", "токена", "Няма конфигурация (наследява системния модел)", "Смени модела",
  "Предназначение", "Модел (от реално достъпните)", "— изберете —", "Обнови списъка с модели",
  "Запази (неактивен)", "Активирай модела", "Моделът е активиран.", "Конфигурацията е записана (неактивна).",
  "Списъкът с модели е обновен.", "Дневна процедура", "График",
  "Всеки ден в 08:00 (Claude Scheduled Tasks)", "Държави (начало → край)", "следваща",
  "Обработени източници", "успешни", "Записи", "Цикъл", "Резюме", "AI логове", "Дата",
  "Всички източници", "Всички статуси", "Държава", "Резултат", "Активен", "Неактивен",
  "Ключът е невалиден", "Няма достъп до избрания модел", "Доставчикът е недостъпен",
  "Първо конфигурирайте API ключ за доставчика", "Ключът е премахнат.",
  "Старият ключ ще бъде заменен и няма да може да бъде възстановен. Продължавате ли?",
  "Ключът ще бъде премахнат, доставчикът — деактивиран, а зависимите модели ще станат unavailable. Продължавате ли?",
  "Няма AI логове", "Тук се записват дневните прегледи и runtime AI заявките (без prompts и без отговори).",
  "Конфигуриран (неактивен до валидация)", "Изключен", "Подготвен модел", "Реалният модел се различава от желания:", "процедури", "промени", "Скрий", "Покажи",
  // --- AI/pipeline/jobs етикети (v2.43.1) ---
  "AI_CREDENTIALS_MASTER_KEY не е зададен (wrangler secret put)", "cron проверява на всеки 2 мин",
  "Display name (не се превежда)", "Pipeline-ът е завършен", "Pipeline-ът е неуспешен", "Pipeline-ът е спрян",
  "Pipeline-ът е частично завършен", "Pipeline-ът работи", "Pipeline-ът се спира.", "Pipeline-ът спира",
  "Prompt версия", "Rate limit — опитайте по-късно", "Автоматично", "Агентът е спрян.",
  "Агрегатите (статистиките) са обобщени стойности, изчислени от вече записаните процедури, документи, бюджети, източници и AI анализи. Използват се за по-бързо зареждане на Обзор, картата на Европа, „Относно системата“, броячите и диаграмите.",
  "Активирането валидира точния model ID срещу доставчика. GPT-5.6 има нива (Sol/Terra/Luna) — изберете реално достъпния ID от списъка, не предполагаем. Цените са приблизителна стойност за ориентир (вход/изход за 1M токена, към",
  "Анализира новите и променени процедури, извлича срокове, кандидати, дейности и структурирана информация.",
  "Блокирана от предишна задача", "Блокирано", "Бъдещ асистент за въпроси (неактивен).", "Бюджети",
  "В момента няма активен pipeline.", "В процес", "В ход", "Вечерен AI pipeline", "Включено",
  "Всички допустими записи", "Всички предназначения", "вход/изход", "Входни токени", "Възстановени задачи",
  "Възстанови блокираните задачи", "Готова", "Готови", "готови", "Грешка в конфигурацията", "Действия",
  "допустими записа", "Доставчик / Модел", "Държава (по избор)", "държави",
  "Ежедневно проверява източниците и извлича новите/променени процедури.", "Етап", "Зависимости", "Завършена",
  "Завършени", "Задачата е стартирана.", "Задачи", "Засегнати записи", "Заявени",
  "Извлича структуриран бюджет — обща сума, валута, съфинансиране.", "Изисква проверка", "Изискват проверка",
  "Изключено", "Използване", "Изпълнява се", "Изпълняват се", "Изпълняващи се", "Изтекло време (timeout)",
  "Изходни токени", "Изчакайте дневният преглед да приключи", "Изчаква зависимост", "Какво се преизчислява?",
  "Класифицира документите и извлича условия, приложения и промени.",
  "Класифицира документите, извлича условия, приложения и промени между версиите.", "Ключът не е конфигуриран",
  "Липсва конфигурация", "напр. GPT-5.6", "не са фактура.", "Неактивен (feature flag)", "Невалиден формат на ключа",
  "Неуспешна", "Неуспешна промяна", "неуспешни", "Неуспешно", "Неуспешно преизчисляване", "Неуспешно спиране",
  "Неуспешно стартиране", "Нови, променени и чакащи",
  "Новите и чакащите задачи ще бъдат отменени. Заявките, които вече са изпратени към AI доставчик, не могат винаги да бъдат прекъснати незабавно и ще приключат безопасно.",
  "Няма задачи", "Обект", "Обзор, снапшоти по държави и Европа, /about, /sources, footer", "Обобщение", "Обработва…",
  "Обработени", "Обработени задачи", "Обработени записи", "Обработи чакащите сега", "Обхват",
  "общ брой, активни, предстоящи, приключени, нови, променени",
  "общ публикуван бюджет, по държави, валидни структурирани записи", "Общо", "Опит", "Опити", "от", "Отменена",
  "Отменени", "Отмени всички чакащи задачи", "Отмени чакащите задачи", "официални, активни, здрави, неуспешни",
  "Повторен анализ (независимо от промени)", "Повтори неуспешните", "Повторна обработка на вече анализирани записи.",
  "Подробностите временно не могат да бъдат заредени.", "Покажи подробности за AI изпълнението",
  "Показани са първите записи.", "Предупреждения и грешки", "Преизчислени за", "Преизчисли статистиките",
  "Преизчисляването НЕ изпраща нови заявки към AI моделите и не води до разход за tokens.", "Преизчисляване…",
  "приключени", "Продължи pipeline-а", "Пропусната — без промяна", "Пропуснати", "Пропуснато", "Процедури",
  "процедури с документи, общ брой, за проверка", "Публични статистики", "работи", "Разход 1 година",
  "Разход 30 дни", "Резервен", "Резервен модел", "Само неуспешни", "Само чакащи",
  "Скрий подробностите за AI изпълнението", "Спиране на агент", "Спиране на вечерния AI pipeline", "Спиране…",
  "Спри", "Спри агента", "Спри вечерния AI pipeline", "Спри след текущата задача",
  "Сравнява процедурите с профила и обяснява защо са подходящи.",
  "Сравнява процедурите със структурирания профил и обяснява защо са подходящи.", "Старт / Край", "Стартирай",
  "Стартирай вечерния AI pipeline", "Стартирай всички активни AI задачи", "Стартирай сега", "Стартирай тест",
  "Стартиране…", "Статистиките са преизчислени.", "стр.",
  "Структурира процедурите — резюме, кандидати, дейности, срокове, региони.",
  "Структурира публикуваните бюджети, разграничава общ бюджет от помощ на проект и извлича валута и съфинансиране.",
  "Създадена", "Тестово изпълнение", "Тестово изпълнение с малък набор (до 3 записа)",
  "Този модел се използва за ежедневната проверка и анализ на процедурите, когато Scheduled Task архитектурата позволява изборът да се управлява от системата. Дневният преглед носи бадж „Управлява се от Claude Scheduled Tasks“ — изборът тук е desired модел и не се прилага автоматично върху задачата.",
  "Тук се появяват задачите на вечерния AI pipeline.", "Успешно", "чакат", "Чакащи",
  "Чакащите задачи на този агент ще бъдат отменени. Зависимите следващи агенти няма да продължат за незавършените записи.",
  "Час", "Час на автоматичното изпълнение", "Частично", "Часът е записан", "Ще бъде повторена",
  "Cloudflare secret", "не е зададен — добавянето на API ключове е блокирано. Задайте го с", "Източник на изпълнение",
];

const ROLES = [
  { key: "user", label: "Потребител" },
  { key: "premium", label: "Премиум" },
  { key: "admin", label: "Администратор" },
];

function fmt(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return isNaN(d) ? ts : d.toLocaleString("bg-BG", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const TABS = [
  ["system", "Система", "grid"],
  ["sources", "Източници", "layers"],
  ["ai", "AI модели", "sparkle"],
  ["users", "Потребители", "users"],
  ["errors", "Exceptions", "alert"],
  ["feedback", "Сигнали", "document"],
];

export default function AdminPage() {
  const session = useSession();
  const [tab, setTab] = useState("system");
  const tl = useUiTranslate(ADMIN_LABELS);

  if (session.loading) return <><AccountHeader session={session} /><main id="main" className="container page"><p className="prose">{tl("Зареждане…")}</p></main></>;

  if (!session.authenticated)
    return (
      <>
        <AccountHeader session={session} />
        <main id="main" className="auth-wrap">
          <section className="auth-card">
            <span className="auth-mark" aria-hidden="true"><Icon name="filter" size={26} /></span>
            <h1>{tl("Вход е необходим")}</h1>
            <p className="auth-desc">{tl("Настройките са достъпни само за администратори.")}</p>
            <button className="btn btn-google btn-google-lg" onClick={() => session.login("/admin")}><GoogleG size={20} /> {tl("Продължи с Google")}</button>
            <a className="auth-secondary" href="/">{tl("Към таблото")}</a>
          </section>
        </main>
      </>
    );

  if (!session.isAdmin)
    return (
      <>
        <AccountHeader session={session} />
        <main id="main" className="auth-wrap">
          <section className="auth-card">
            <span className="auth-mark" aria-hidden="true" style={{ background: "linear-gradient(135deg,var(--red),#8a1420)" }}><Icon name="alert" size={26} /></span>
            <h1>{tl("Няма достъп")}</h1>
            <p className="auth-desc">{tl("Тази страница е само за администратори. Ако смятате, че това е грешка, свържете се с администратор.")}</p>
            <a className="btn btn-primary" href="/">{tl("Към таблото")}</a>
          </section>
        </main>
      </>
    );

  return (
    <UiTrContext.Provider value={tl}>
      <AccountHeader session={session} />
      <main id="main" className="container page admin">
        <div className="page-head"><h1>{tl("Настройки · Администрация")}</h1><p>{tl("Системни настройки, потребители, журнал на грешките и сигнали.")}</p></div>

        <div className="admin-tabs" role="tablist" aria-label={tl("Раздели")}>
          {TABS.map(([k, l, ic]) => (
            <button key={k} role="tab" aria-selected={tab === k} className="admin-tab" onClick={() => setTab(k)}>
              <Icon name={ic} size={16} /> <span className="tab-label">{tl(l)}</span>
            </button>
          ))}
        </div>

        {tab === "system" && <SystemTab session={session} />}
        {tab === "sources" && <SourcesTab />}
        {tab === "ai" && <AiModelsTab />}
        {tab === "users" && <UsersTab />}
        {tab === "errors" && <ErrorsTab />}
        {tab === "feedback" && <FeedbackTab />}
      </main>
    </UiTrContext.Provider>
  );
}

function SystemTab({ session }) {
  const tl = useUiTr();
  const [stats, setStats] = useState(null);
  const [sys, setSys] = useState(null);
  const [build, setBuild] = useState(null);
  useEffect(() => {
    fetch("/api/projects").then((r) => r.json()).then((d) => {
      const p = d.projects || [];
      setStats({ total: p.length, open: p.filter((x) => x.status === "open" || x.status === "closing_soon").length, docs: p.filter((x) => x.doc_count > 0).length, snapshot: d.snapshot?.run_date || "—" });
    }).catch(() => setStats({ total: "—", open: "—", docs: "—", snapshot: "—" }));
    fetch("/api/admin/system", { credentials: "same-origin" }).then((r) => r.json()).then((d) => setSys(d.system || null)).catch(() => setSys(null));
    fetch("/version.json", { cache: "no-store" }).then((r) => r.json()).then(setBuild).catch(() => setBuild(null));
  }, []);
  const tr = sys?.translation;
  const c = sys?.counts;
  return (
    <>
      <section className="prof-card">
        <h2 className="prof-section-title">{tl("Системна информация")}</h2>
        <dl className="sys-grid">
          <div><dt>{tl("Версия")}</dt><dd>{APP_VERSION}</dd></div>
          <div><dt>{tl("Влезли сте като")}</dt><dd>{session.user?.email} <span className="role-chip">админ</span></dd></div>
          <div><dt>Build ID</dt><dd className="mono">{build?.buildId || "…"}</dd></div>
          <div><dt>{tl("Домейн")}</dt><dd className="mono">{sys?.appUrl ? sys.appUrl.replace(/^https?:\/\//, "") : "euro-funds.eu"}</dd></div>
          <div><dt>{tl("Съхранение")}</dt><dd>Cloudflare D1 + Worker</dd></div>
          <div><dt>{tl("Източници")}</dt><dd>eufunds.bg, esf.bg, az.government.bg, ПКИП</dd></div>
          <div><dt>{tl("Общо процедури")}</dt><dd>{stats ? stats.total : "…"}</dd></div>
          <div><dt>{tl("Отворени")}</dt><dd>{stats ? stats.open : "…"}</dd></div>
          <div><dt>{tl("С документи")}</dt><dd>{stats ? stats.docs : "…"}</dd></div>
          <div><dt>{tl("Последно обновяване")}</dt><dd>{stats ? stats.snapshot : "…"}</dd></div>
        </dl>
      </section>

      <section className="prof-card">
        <h2 className="prof-section-title">{tl("Многоезичност и превод")}</h2>
        <dl className="sys-grid">
          <div><dt>{tl("Статус на превода")}</dt><dd>{tr ? (tr.configured ? <span className="role-chip" style={{ background: "var(--green-bg,#dcfce7)", color: "var(--green-ink,#15803d)" }}>{tl("активен")}</span> : <span className="role-chip" style={{ background: "var(--amber-bg,#fef3c7)", color: "var(--amber-ink,#92400e)" }}>{tl("неактивен")}</span>) : "…"}</dd></div>
          <div><dt>{tl("Доставчик")}</dt><dd>{tr?.provider || "…"}</dd></div>
          <div><dt>{tl("Поддържани езици")}</dt><dd>{tr ? tr.languages : "…"}</dd></div>
          <div><dt>{tl("Локация")}</dt><dd className="mono">{tr?.location || "…"}</dd></div>
          <div><dt>{tl("Речник (glossary)")}</dt><dd>{tr ? (tr.glossaryEnabled ? `${tl("включен")} · v${tr.glossaryVersion}` : `${tl("изключен")} · v${tr.glossaryVersion}`) : "…"}</dd></div>
          <div><dt>{tl("Кеширани преводи")}</dt><dd>{tr ? tr.cacheEntries : "…"}</dd></div>
          <div><dt>{tl("Езици в кеша")}</dt><dd>{tr ? tr.cacheLanguages : "…"}</dd></div>
        </dl>
        {tr && !tr.configured && <p className="chart-note"><Icon name="alert" size={13} /> Секретите за Google Cloud Translation не са зададени — интерфейсът ползва български fallback. Виж TRANSLATION-SETUP.md.</p>}
      </section>

      <section className="prof-card">
        <h2 className="prof-section-title">{tl("База данни")}</h2>
        <dl className="sys-grid">
          <div><dt>{tl("Потребители")}</dt><dd>{c ? c.users : "…"}</dd></div>
          <div><dt>{tl("Запазени процедури")}</dt><dd>{c ? c.saved : "…"}</dd></div>
          <div><dt>{tl("Документи")}</dt><dd>{c ? c.documents : "…"}</dd></div>
          <div><dt>{tl("Записи в changelog")}</dt><dd>{c ? c.changelog : "…"}</dd></div>
        </dl>
        <h2 className="prof-section-title" style={{ marginTop: 20 }}>{tl("Роли")}</h2>
        <p className="prose">Достъпът се управлява чрез роли: <strong>Потребител</strong> (базов достъп + профил и запазени), <strong>Премиум</strong> (за бъдещи разширени функции) и <strong>Администратор</strong> (тази конзола). Управлявайте ролите в раздел „Потребители".</p>
        <p className="chart-note"><Icon name="info" size={13} /> Данните за процедурите се обновяват автоматично всеки ден от насрочената задача. Тук няма деструктивни действия върху публичните данни.</p>
      </section>
    </>
  );
}

// --- Източници (funding_sources) — преглед, филтри, активиране, добавяне, редакция ---
const HEALTH_OPTIONS = ["unknown", "healthy", "degraded", "failing", "blocked"];
const PAGE_SIZE = 25;

// Кратък URL (домейн) + стрелка за разгъване на пълните адреси.
function UrlCell({ source }) {
  const [open, setOpen] = useState(false);
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
  const urls = [["Base", source.base_url], ["Покани", source.calls_url], ["Програми", source.programmes_url]].filter(([, u]) => u);
  return (
    <td className="url-cell">
      <span className="url-short">
        <a href={source.base_url} target="_blank" rel="noopener noreferrer nofollow" className="mono">{host(source.base_url)}</a>
        <button type="button" className="url-toggle" aria-expanded={open} aria-label={open ? "Скрий пълните адреси" : "Покажи пълните адреси"} onClick={() => setOpen((v) => !v)}>
          <Icon name="chevronRight" size={13} style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
        </button>
      </span>
      {open && (
        <div className="url-full">
          {urls.map(([label, u]) => (
            <a key={label} href={u} target="_blank" rel="noopener noreferrer nofollow"><strong>{label}:</strong> {u}</a>
          ))}
        </div>
      )}
    </td>
  );
}
const EMPTY_SOURCE = { id: "", country_code: "", name: "", authority_name: "", base_url: "", calls_url: "", source_type: "portal", source_level: "national", source_language: "", coverage_description: "", priority: 100, verified: false, enabled: false, requires_javascript: false, primary_source: false };

function SourcesTab() {
  const tl = useUiTr();
  const [data, setData] = useState(null); // {sources, countries}
  const [country, setCountry] = useState("");
  const [flt, setFlt] = useState("all"); // all | enabled | disabled | verified | unverified | unhealthy
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null); // id на редактирания или "new"
  const [form, setForm] = useState(EMPTY_SOURCE);
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    fetch("/api/admin/sources", { credentials: "same-origin" }).then((r) => r.json()).then((d) => setData({ sources: d.sources || [], countries: d.countries || [] })).catch(() => setData({ sources: [], countries: [] }));
  }, []);
  useEffect(() => { load(); }, [load]);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(null), 2500); };

  const patch = async (id, body) => {
    setSaving(true);
    try {
      const r = await fetch("/api/admin/sources/" + encodeURIComponent(id), { method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json", "X-Requested-With": "fetch" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error();
      flash("Записано."); load();
    } catch { flash("Промяната не бе записана."); }
    finally { setSaving(false); }
  };

  const create = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/admin/sources", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "X-Requested-With": "fetch" }, body: JSON.stringify(form) });
      if (!r.ok) throw new Error();
      flash("Източникът е добавен."); setEditing(null); setForm(EMPTY_SOURCE); load();
    } catch { flash("Добавянето не бе успешно (дублирано id или невалидни полета)."); }
    finally { setSaving(false); }
  };

  const saveEdit = async () => {
    const b = { ...form }; delete b.id; delete b.country_code;
    await patch(editing, b);
    setEditing(null); setForm(EMPTY_SOURCE);
  };

  if (data == null) return <section className="prof-card"><p className="prose">Зареждане…</p></section>;

  const rows = data.sources.filter((s) => {
    if (country && s.country_code !== country) return false;
    if (flt === "enabled" && !s.enabled) return false;
    if (flt === "disabled" && s.enabled) return false;
    if (flt === "verified" && !s.verified) return false;
    if (flt === "unverified" && s.verified) return false;
    if (flt === "unhealthy" && ["healthy", "unknown"].includes(s.source_health)) return false;
    if (q) { const h = `${s.id} ${s.name} ${s.authority_name || ""} ${s.base_url}`.toLowerCase(); if (!h.includes(q.toLowerCase())) return false; }
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const curPage = Math.min(page, totalPages);
  const pageRows = rows.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);
  const cName = (code) => (data.countries.find((c) => c.code === code)?.name_bg) || code;
  const healthTone = (h) => (h === "healthy" ? "green" : h === "degraded" ? "amber" : h === "failing" || h === "blocked" ? "red" : "neutral");

  const editForm = (isNew) => (
    <section className="prof-card">
      <h2 className="prof-section-title">{isNew ? tl("Нов източник") : `${tl("Редакция")}: ${editing}`}</h2>
      <div className="form-grid">
        {isNew && <label className="field"><span className="field-label">ID</span><input className="inp" value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} placeholder="gr-espa" /></label>}
        {isNew && (
          <label className="field"><span className="field-label">{tl("Държава")}</span>
            <select className="inp" value={form.country_code} onChange={(e) => setForm({ ...form, country_code: e.target.value })}>
              <option value="">—</option>
              {data.countries.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.name_bg}</option>)}
            </select>
          </label>
        )}
        <label className="field"><span className="field-label">{tl("Име")}</span><input className="inp" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className="field"><span className="field-label">{tl("Орган (authority)")}</span><input className="inp" value={form.authority_name || ""} onChange={(e) => setForm({ ...form, authority_name: e.target.value })} /></label>
        <label className="field"><span className="field-label">Base URL</span><input className="inp" value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} /></label>
        <label className="field"><span className="field-label">Calls URL</span><input className="inp" value={form.calls_url || ""} onChange={(e) => setForm({ ...form, calls_url: e.target.value })} /></label>
        <label className="field"><span className="field-label">{tl("Тип")}</span>
          <select className="inp" value={form.source_type} onChange={(e) => setForm({ ...form, source_type: e.target.value })}>
            {["portal", "authority", "agency", "application_system", "monitoring", "system", "rss", "api"].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="field"><span className="field-label">{tl("Ниво")}</span>
          <select className="inp" value={form.source_level} onChange={(e) => setForm({ ...form, source_level: e.target.value })}>
            {["national", "regional", "programme"].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="field"><span className="field-label">{tl("Език (код)")}</span><input className="inp inp-sm" value={form.source_language || ""} onChange={(e) => setForm({ ...form, source_language: e.target.value })} /></label>
        <label className="field"><span className="field-label">{tl("Приоритет")}</span><input className="inp inp-sm" type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} /></label>
        <label className="field" style={{ gridColumn: "1 / -1" }}><span className="field-label">{tl("Покритие (описание)")}</span><input className="inp" value={form.coverage_description || ""} onChange={(e) => setForm({ ...form, coverage_description: e.target.value })} /></label>
      </div>
      <div className="check-cols" style={{ marginTop: 8 }}>
        <label className="check"><input type="checkbox" checked={!!form.verified} onChange={(e) => setForm({ ...form, verified: e.target.checked })} /><span>{tl("Проверен (verified)")}</span></label>
        <label className="check"><input type="checkbox" checked={!!form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /><span>{tl("Активен (enabled — production sync)")}</span></label>
        <label className="check"><input type="checkbox" checked={!!form.primary_source} onChange={(e) => setForm({ ...form, primary_source: e.target.checked })} /><span>{tl("Основен източник")}</span></label>
        <label className="check"><input type="checkbox" checked={!!form.requires_javascript} onChange={(e) => setForm({ ...form, requires_javascript: e.target.checked })} /><span>{tl("Изисква JavaScript")}</span></label>
      </div>
      <div className="prof-actions">
        <button className="btn btn-primary" disabled={saving} onClick={isNew ? create : saveEdit}><Icon name="check" size={16} /> {isNew ? tl("Добави източника") : tl("Запази промените")}</button>
        <button className="btn" onClick={() => { setEditing(null); setForm(EMPTY_SOURCE); }}>{tl("Отказ")}</button>
      </div>
      <p className="chart-note"><Icon name="info" size={13} /> {tl("Добавяйте само официални източници (държавни портали и управляващи органи). „Активен“ включва източника в автоматичната синхронизация — само след проверка и QA.")}</p>
    </section>
  );

  return (
    <>
      <section className="prof-card">
        <div className="ov-section-head" style={{ flexWrap: "wrap", gap: 8 }}>
          <h2 className="prof-section-title" style={{ margin: 0 }}>{tl("Източници")}</h2>
          <span className="count-dot">{rows.length}</span>
          {msg && <span className="save-ok" role="status"><Icon name="check" size={14} /> {msg}</span>}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select className="inp inp-sm" value={country} onChange={(e) => { setCountry(e.target.value); setPage(1); }} aria-label={tl("Всички държави")}>
              <option value="">{tl("Всички държави")}</option>
              {data.countries.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.name_bg} ({data.sources.filter((s) => s.country_code === c.code).length})</option>)}
            </select>
            <select className="inp inp-sm" value={flt} onChange={(e) => { setFlt(e.target.value); setPage(1); }} aria-label={tl("Всички статуси")}>
              <option value="all">{tl("Всички статуси")}</option>
              <option value="enabled">{tl("Само активни")}</option>
              <option value="disabled">{tl("Само неактивни")}</option>
              <option value="verified">{tl("Само проверени")}</option>
              <option value="unverified">{tl("Непроверени")}</option>
              <option value="unhealthy">{tl("Проблемни (health)")}</option>
            </select>
            <input className="inp inp-sm" placeholder={tl("Търсене…")} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label={tl("Търсене…")} />
            <button className="btn btn-ghost" onClick={load}><Icon name="refresh" size={16} /> {tl("Обнови")}</button>
            <button className="btn btn-primary" onClick={() => { setEditing("new"); setForm(EMPTY_SOURCE); }}><Icon name="sparkle" size={16} /> {tl("Добави")}</button>
          </div>
        </div>

        <div className="table-scroll">
          <table className="admin-table">
            <thead><tr><th>{tl("Държава")}</th><th>{tl("Източник")}</th><th>URL</th><th>{tl("Тип/Ниво")}</th><th>{tl("Приор.")}</th><th>Verified</th><th>{tl("Активен")}</th><th>Health</th><th>{tl("Посл. успех")}</th><th></th></tr></thead>
            <tbody>
              {pageRows.map((s) => (
                <tr key={s.id}>
                  <td className="nowrap">{s.country_code} · {cName(s.country_code)}</td>
                  <td><strong>{s.name}</strong>{s.authority_name ? <div className="row-sub">{s.authority_name}</div> : null}{s.requires_javascript ? <span className="badge amber" style={{ marginTop: 2 }}>JS</span> : null}</td>
                  <UrlCell source={s} />
                  <td className="nowrap">{s.source_type}<div className="row-sub">{s.source_level}</div></td>
                  <td>{s.priority}</td>
                  <td>
                    <label className="check" style={{ margin: 0 }}><input type="checkbox" checked={!!s.verified} disabled={saving} onChange={(e) => patch(s.id, { verified: e.target.checked })} /><span className="sr-only">verified</span></label>
                  </td>
                  <td>
                    <label className="check" style={{ margin: 0 }}><input type="checkbox" checked={!!s.enabled} disabled={saving} onChange={(e) => { if (e.target.checked && !s.verified) { flash("Първо маркирайте източника като проверен."); return; } patch(s.id, { enabled: e.target.checked }); }} /><span className="sr-only">enabled</span></label>
                  </td>
                  <td>
                    <select className={"inp inp-sm health-select h-" + s.source_health} value={s.source_health} disabled={saving} onChange={(e) => patch(s.id, { source_health: e.target.value })} aria-label="Source health">
                      {HEALTH_OPTIONS.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                    {s.consecutive_failures > 0 && <div className="row-sub"><span className={"badge " + healthTone(s.source_health)}>{s.consecutive_failures} грешки</span></div>}
                  </td>
                  <td className="nowrap">{s.last_success_at ? fmt(s.last_success_at) : "—"}</td>
                  <td><button className="btn btn-ghost" onClick={() => { setEditing(s.id); setForm({ ...EMPTY_SOURCE, ...s }); }}><Icon name="document" size={14} /> {tl("Редакция")}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <div className="state ov-empty"><Icon name="layers" size={26} /><h3>{tl("Няма източници по този филтър")}</h3><p>{tl("Променете филтрите или добавете нов източник.")}</p></div>}
        {rows.length > PAGE_SIZE && (
          <div className="admin-pager">
            <span className="pg-info">{(curPage - 1) * PAGE_SIZE + 1}–{Math.min(curPage * PAGE_SIZE, rows.length)} / {rows.length}</span>
            <button className="btn btn-ghost" disabled={curPage <= 1} onClick={() => setPage(curPage - 1)}><Icon name="chevronRight" size={14} style={{ transform: "rotate(180deg)" }} /> {tl("Предишна")}</button>
            <span className="pg-info" style={{ margin: 0 }}>{curPage} / {totalPages}</span>
            <button className="btn btn-ghost" disabled={curPage >= totalPages} onClick={() => setPage(curPage + 1)}>{tl("Следваща")} <Icon name="chevronRight" size={14} /></button>
          </div>
        )}
      </section>

      {editing === "new" && editForm(true)}
      {editing && editing !== "new" && editForm(false)}
    </>
  );
}

function UsersTab() {
  const tl = useUiTr();
  const [users, setUsers] = useState(null);
  const [msg, setMsg] = useState(null);
  const load = useCallback(() => { fetch("/api/admin/users", { credentials: "same-origin" }).then((r) => r.json()).then((d) => setUsers(d.users || [])).catch(() => setUsers([])); }, []);
  useEffect(() => { load(); }, [load]);

  const changeRole = async (id, role) => {
    setUsers((us) => us.map((u) => (u.id === id ? { ...u, role, _saving: true } : u)));
    try {
      const r = await fetch("/api/admin/users/" + encodeURIComponent(id), { method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json", "X-Requested-With": "fetch" }, body: JSON.stringify({ role }) });
      if (!r.ok) throw new Error();
      setMsg(tl("Ролята е обновена.")); setTimeout(() => setMsg(null), 2000);
    } catch { setMsg(tl("Промяната не бе записана.")); load(); }
    finally { setUsers((us) => us.map((u) => (u.id === id ? { ...u, _saving: false } : u))); }
  };

  if (users == null) return <section className="prof-card"><p className="prose">{tl("Зареждане…")}</p></section>;
  return (
    <section className="prof-card">
      <div className="ov-section-head"><h2 className="prof-section-title" style={{ margin: 0 }}>{tl("Потребители")}</h2><span className="count-dot">{users.length}</span>{msg && <span className="save-ok" role="status"><Icon name="check" size={14} /> {msg}</span>}</div>
      <div className="table-scroll">
        <table className="admin-table">
          <thead><tr><th>{tl("Потребител")}</th><th>{tl("Имейл")}</th><th>{tl("Роля")}</th><th>{tl("Регистриран")}</th><th>{tl("Последен вход")}</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td><div className="u-cell">{u.avatar_url ? <img src={u.avatar_url} alt="" width={28} height={28} className="um-avatar" referrerPolicy="no-referrer" /> : <span className="um-avatar um-initials">{(u.display_name || u.email || "?").charAt(0).toUpperCase()}</span>}<span>{u.display_name || "—"}</span></div></td>
                <td className="mono">{u.email}</td>
                <td>
                  <select className="inp inp-sm" value={u.role} disabled={u._saving} onChange={(e) => changeRole(u.id, e.target.value)} aria-label={`${tl("Роля")}: ${u.email}`}>
                    {ROLES.map((r) => <option key={r.key} value={r.key}>{tl(r.label)}</option>)}
                  </select>
                </td>
                <td>{fmt(u.created_at)}</td>
                <td>{fmt(u.last_login_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ErrorsTab() {
  const tl = useUiTr();
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(null);
  const load = useCallback(() => { fetch("/api/admin/errors?limit=200", { credentials: "same-origin" }).then((r) => r.json()).then((d) => setRows(d.errors || [])).catch(() => setRows([])); }, []);
  useEffect(() => { load(); }, [load]);
  const clear = async () => { if (!confirm(tl("Да изчистя ли журнала с грешки?"))) return; await fetch("/api/admin/errors", { method: "DELETE", credentials: "same-origin", headers: { "X-Requested-With": "fetch" } }); load(); };

  if (rows == null) return <section className="prof-card"><p className="prose">{tl("Зареждане…")}</p></section>;
  return (
    <section className="prof-card">
      <div className="ov-section-head">
        <h2 className="prof-section-title" style={{ margin: 0 }}>Exceptions</h2>
        <span className="count-dot">{rows.length}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={load}><Icon name="refresh" size={16} /> {tl("Обнови")}</button>
          {rows.length > 0 && <button className="btn btn-danger" onClick={clear}><Icon name="close" size={16} /> {tl("Изчисти")}</button>}
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="state ov-empty"><Icon name="check" size={26} /><h3>{tl("Няма записани грешки")}</h3><p>{tl("Системата не е регистрирала грешки. Тук се събират сървърни и клиентски изключения.")}</p></div>
      ) : (
        <div className="table-scroll">
          <table className="admin-table">
            <thead><tr><th>{tl("Време")}</th><th>{tl("Източник")}</th><th>{tl("Метод/Път")}</th><th>{tl("Статус")}</th><th>{tl("Съобщение")}</th></tr></thead>
            <tbody>
              {rows.map((e) => [
                <tr key={e.id} className="err-row" onClick={() => setOpen(open === e.id ? null : e.id)}>
                  <td className="nowrap">{fmt(e.created_at)}</td>
                  <td><span className={"badge " + (e.source === "server" ? "amber" : "blue")}>{e.source || "?"}</span></td>
                  <td className="mono">{e.method} {e.path}</td>
                  <td>{e.status || "—"}</td>
                  <td className="err-msg">{e.message}</td>
                </tr>,
                open === e.id && e.detail ? <tr key={e.id + "-d"}><td colSpan={5}><pre className="err-detail">{e.detail}</pre></td></tr> : null,
              ])}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FeedbackTab() {
  const tl = useUiTr();
  const [rows, setRows] = useState(null);
  const load = useCallback(() => { fetch("/api/admin/feedback?limit=200", { credentials: "same-origin" }).then((r) => r.json()).then((d) => setRows(d.feedback || [])).catch(() => setRows([])); }, []);
  useEffect(() => { load(); }, [load]);
  const TYPE = { bug: "Грешка", data: "Неточни данни", idea: "Предложение" };
  const TONE = { bug: "red", data: "amber", idea: "blue" };

  if (rows == null) return <section className="prof-card"><p className="prose">{tl("Зареждане…")}</p></section>;
  return (
    <section className="prof-card">
      <div className="ov-section-head">
        <h2 className="prof-section-title" style={{ margin: 0 }}>{tl("Сигнали")}</h2>
        <span className="count-dot">{rows.length}</span>
        <button className="btn btn-ghost" style={{ marginLeft: "auto" }} onClick={load}><Icon name="refresh" size={16} /> {tl("Обнови")}</button>
      </div>
      {rows.length === 0 ? (
        <div className="state ov-empty"><Icon name="check" size={26} /><h3>{tl("Няма сигнали")}</h3><p>{tl("Тук се показват подадените сигнали от потребителите (бутон „Подай сигнал за проблем“).")}</p></div>
      ) : (
        <div className="table-scroll">
          <table className="admin-table">
            <thead><tr><th>{tl("Време")}</th><th>{tl("Тип")}</th><th>{tl("Заглавие")}</th><th>{tl("Описание")}</th><th>{tl("Адрес / версия")}</th><th>{tl("Имейл")}</th></tr></thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.id}>
                  <td className="nowrap">{fmt(f.created_at)}</td>
                  <td><span className={"badge " + (TONE[f.type] || "neutral")}>{tl(TYPE[f.type] || f.type)}</span></td>
                  <td>{f.title || "—"}</td>
                  <td className="fb-desc">{f.description}</td>
                  <td className="mono">{f.url}{f.app_version ? ` · v${f.app_version}` : ""}</td>
                  <td className="mono">{f.email || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
