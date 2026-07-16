# Автентикация — Google SSO (настройка)

Входът е реализиран изцяло в Cloudflare Worker-а (`worker/*`) с **Web Crypto**,
без Node-only библиотеки — съвместимо с Workers. Използва се **OAuth 2.0
Authorization Code + PKCE**, сървърна размяна на кода и проверка на Google ID
токена през JWKS. Сесиите са сървърни (D1), с HttpOnly бисквитка.

Публичното разглеждане на процедурите работи и без вход.

## 1. Променливи на средата

| Име | Тип | Описание |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | secret | OAuth Client ID от Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | secret | OAuth Client Secret |
| `AUTH_SECRET` | secret | дълъг случаен низ (напр. `openssl rand -base64 48`) — ключ за хеширане на сесийните токени |
| `APP_URL` | var | базов публичен адрес (за callback/redirect) |

**Локална разработка:** копирайте `.dev.vars.example` → `.dev.vars` и попълнете.
`.dev.vars` е в `.gitignore` и не се комитва.

**Продукция:** задайте тайните с Wrangler (не в `wrangler.toml`):

```bash
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put AUTH_SECRET
```

`APP_URL` е зададен като `[vars]` в `wrangler.toml` (не е тайна).

## 2. Точни Redirect URI за регистриране в Google

Добавете и двата като **Authorized redirect URIs** в OAuth клиента:

- **Разработка:** `http://localhost:8787/api/auth/google/callback`
- **Продукция:** `https://evroproekti-dashboard.autumn-limit-8eff.workers.dev/api/auth/google/callback`

> Ако смените домейна, callback-ът е винаги `<APP_URL>/api/auth/google/callback`.
> Authorized JavaScript origins: `http://localhost:8787` и продукционният ориджин.

## 3. Стъпки в Google Cloud Console

1. Влезте в [console.cloud.google.com](https://console.cloud.google.com) и създайте/изберете проект.
2. **APIs & Services → OAuth consent screen**: изберете „External", попълнете име на приложението, имейл за поддръжка и лого (по избор). Scopes: само `openid`, `email`, `profile`. Добавете тестови потребители при нужда.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
4. Тип: **Web application**.
5. **Authorized redirect URIs**: добавете двата URI от точка 2.
6. Запишете и копирайте **Client ID** и **Client secret**.
7. Задайте ги като секрети (виж точка 1). Готово.

Използвани scopes: **само** `openid email profile` (базова идентичност). Не се
искат допълнителни права (напр. Google Calendar).

## 4. Миграции на базата

Схемата е в `migrations/`. Прилагане **локално** (miniflare) — безопасно:

```bash
wrangler d1 execute evroproekti-dashboard --local --file=./migrations/0001_indexes.sql
wrangler d1 execute evroproekti-dashboard --local --file=./migrations/0002_auth.sql
```

За **продукция** (ръчно, съзнателно — не се прави автоматично оттук):

```bash
wrangler d1 execute evroproekti-dashboard --remote --file=./migrations/0002_auth.sql
```

Миграцията е само добавяща (`CREATE TABLE IF NOT EXISTS`) — не пипа
`projects/documents/snapshots` и не трие данни.

## 5. Локално пускане

```bash
npm run build           # генерира ./out
wrangler dev            # http://localhost:8787 (API + статика + вход)
```

## 6. Сигурност (обобщено)

- Authorization Code + PKCE (S256); `state` и `nonce` са еднократни (D1 `oauth_state`, изтриват се при callback).
- Сървърна размяна на кода; ID токенът се проверява по подпис (JWKS RS256) + `iss`/`aud`/`exp`/`nonce`/`email_verified`.
- Клиентски Google данни НЕ се приемат за автентикация.
- Сесии в D1: пази се само HMAC хеш на токена (`AUTH_SECRET`); суровият токен е в `HttpOnly` + `Secure` (в продукция) + `SameSite=Lax` бисквитка; ротация при вход; невалидиране при изход.
- CSRF: мутиращите заявки изискват същия произход (Origin/Referer).
- Open-redirect защита: `return_to` се приема само като относителен път.
- Авторизация: потребителят се извежда от сесията; клиентски `user_id` не се доверява; всяка лична заявка проверява собствеността.
- Не се пазят Google access токени; нищо чувствително не се логва.
