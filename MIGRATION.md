# Миграцията е ОТМЕНЕНА — работим само в Office@s2kdesign.com

`wrangler.toml` е върнат към акаунта **Office@s2kdesign.com**
(`account_id = 9c3fcd4952bcf0c295532e9884377d37`, D1 `d5f1bb40-3729-4c11-ae06-efbd4b5c9760`).
Дневната задача също сочи този акаунт (не е променяна). Живият сайт е непокътнат.

## Остава да изтриеш ръчно ленните ресурси на другия акаунт

⚠️ **Влез в акаунта „Bai_gundi@abv.bg" (НЕ Office@s2kdesign.com!)** преди да триеш —
за да не изтриеш живата база/worker по погрешка.

### 1. Изтрий D1 базата, създадена при опита за миграция
- Cloudflare → акаунт **Bai_gundi@abv.bg** → Storage & Databases → D1
- База: **evroproekti-dashboard** (`8044661a-3631-4884-9d5e-08a63827fa40`)
- Settings → **Delete database**

  или през CLI (в акаунта Bai_gundi):
  `npx wrangler d1 delete evroproekti-dashboard` — потвърди, че е с id `8044661a…`

### 2. Изтрий празния worker
- Cloudflare → акаунт **Bai_gundi@abv.bg** → Compute → Workers & Pages
- Worker: **evroproekti-dashboard** (0 deployments, subdomain coingardenworld)
- Settings → **Delete**

Базата на Office@s2kdesign.com (`d5f1bb40…`) и живият worker там **не се пипат**.

След като изтриеш горните два ресурса, можеш да изтриеш и този файл (MIGRATION.md).
