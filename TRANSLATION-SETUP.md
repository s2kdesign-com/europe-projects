# Google Cloud Translation — настройка (за многоезичността)

Google login и Google Cloud Translation са **две отделни интеграции**. Не пипай
съществуващия login. Тук създаваш **отделен service account** само за превода.
Приватният ключ се чете само в Cloudflare Worker-а и **никога** не влиза във
фронтенда.

## 1. Проект и API

1. Влез в <https://console.cloud.google.com/>.
2. Създай проект (или използвай съществуващ). Запиши **Project ID**.
3. „APIs & Services" → „Enable APIs and Services" → потърси **Cloud Translation API** → **Enable**.

## 2. Service account с минимална роля

1. „IAM & Admin" → „Service Accounts" → **Create service account**.
   - Име: напр. `evroproekti-translate`.
2. Роля: **Cloud Translation API User** (`roles/cloudtranslate.user`).
   - НЕ давай Owner/Editor.
3. Създай го, после отвори service account-а → таб **Keys** → **Add key** →
   **Create new key** → тип **JSON** → изтегли файла.

От JSON-а ще ти трябват три стойности:
- `project_id`
- `client_email`
- `private_key` (многоредов низ, започва с `-----BEGIN PRIVATE KEY-----`)

## 3. (По желание) Glossary

За устойчиви преводи на термините (Европроекти, ПРЧР, ПКИП, безвъзмездна помощ…)
се създава glossary ресурс в Translation API. Записва се `GLOSSARY_ID`. Може да
се добави по-късно — не е задължителен за старта.

## 4. Cloudflare secrets

Задай ги на Worker-а (в акаунта Office@s2kdesign.com). От папката `dashboard`:

```
npx wrangler secret put GOOGLE_CLOUD_PROJECT_ID
npx wrangler secret put GOOGLE_TRANSLATE_CLIENT_EMAIL
npx wrangler secret put GOOGLE_TRANSLATE_PRIVATE_KEY
npx wrangler secret put GOOGLE_TRANSLATE_LOCATION      # въведи: global
npx wrangler secret put GOOGLE_TRANSLATE_GLOSSARY_ID   # по желание
```

- При `GOOGLE_TRANSLATE_PRIVATE_KEY` постави целия ключ, включително
  `-----BEGIN/END PRIVATE KEY-----` и новите редове (или като `\n`).
- Секретите не са във version control и не се връщат към браузъра.

## 5. Как Worker-ът ги ползва (Фаза 3)

Worker-ът подписва кратък **RS256 JWT** с `private_key` през WebCrypto, разменя го
за Google OAuth2 access token и извиква
`POST /v3/projects/{projectId}/locations/{location}:translateText`. Никакъв API key,
никакви credentials във фронтенда. Резултатите се кешират в D1 `translation_cache`
по SHA-256 ключ (език + текст + glossary версия), за да не се превежда едно и също
многократно.

## Какво работи и без секретите

Основата (Фаза 1) работи веднага: разпознаване на езика, ръчен избор от footer-а и
профила, запазване между посещения/устройства, локализирано форматиране на дати и
числа. Докато секретите липсват, некирилските каталози показват **български
fallback** (без счупване). Живият превод се включва, щом зададеш секретите и се
изгради Фаза 3.
