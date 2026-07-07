# Европроекти — Дашборд

Модерен Next.js дашборд за активни и предстоящи европроцедури за България
(с фокус върху младежка заетост). Данните се пазят в **Cloudflare D1** и се
**обновяват автоматично всеки ден** от насрочената задача в Claude.

## Как е устроено

```
Насрочена задача (всеки ден 08:08)
   │  прави уеб проучване + записва в D1 чрез Cloudflare MCP
   ▼
Cloudflare D1  «evroproekti-dashboard»   (таблици: projects, snapshots)
   ▲  чете през /api/projects (D1 binding в worker.js)
   │
Cloudflare Worker + статичен Next.js дашборд (./out)
```

- **Групиране по програма/приоритет** (ПРЧР, ПКИП, Образование, Околна среда…).
- Статуси: Отворена / Изтича скоро / Предстояща / Приключена.
- Търсене, филтри (Всички / Отворени / Предстоящи / Младежки), броячи на дни до срок.
- Банер „Ново/променено" от последния дневен snapshot.

База данни (вече създадена):
- Име: `evroproekti-dashboard`
- ID: `d5f1bb40-3729-4c11-ae06-efbd4b5c9760`
- Акаунт: Office@s2kdesign.com (`9c3fcd4952bcf0c295532e9884377d37`)

## Деплой в Cloudflare (еднократно)

Нужен е Node 18+ (работи и на Node 24) и вход в Cloudflare.

```bash
cd dashboard
npm install

# 1) Вход в Cloudflare (отваря браузър)
npx wrangler login
#    ИЛИ задай API token:  set CLOUDFLARE_API_TOKEN=...   (Windows)

# 2) Билд + деплой (прави `next build` и качва Worker-а с D1 binding)
npm run deploy
```

Накрая получаваш адрес от вида
`https://evroproekti-dashboard.<твой-subdomain>.workers.dev`.

> Ако имаш стара папка `.open-next` от предишен опит — може да я изтриеш, вече не се ползва.

### Локален преглед
```bash
npm run dev     # Next.js dev сървър (само UI; за реални данни ползвай деплоя)
```

## Структура

```
dashboard/
├─ app/
│  ├─ page.jsx              # клиентски компонент, тегли /api/projects
│  ├─ layout.jsx
│  ├─ globals.css           # стилове (модерен вид)
│  └─ components/Dashboard.jsx  # UI: секции, филтри, карти
├─ worker.js                # Cloudflare Worker: /api/projects (D1) + статични файлове
├─ wrangler.toml            # binding-и (D1, ASSETS) + конфигурация
├─ next.config.mjs          # output: "export"
└─ package.json
```

## Схема на базата

`projects`: id, name, program, priority, category (youth/new/other),
status (open/closing_soon/upcoming/closed), deadline, deadline_date, budget,
eligible, link, notes, is_new, first_seen, last_updated.

`snapshots`: id, run_date, summary, created_at — дневно резюме „какво е ново".
