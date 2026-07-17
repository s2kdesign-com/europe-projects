// Slug за procedure detail URL-и: стабилен код + четимо заглавие, само малки
// латински букви, цифри и тирета. Напр.
//   ("BG05SFPR001-2.005", "Подкрепа за ученици с таланти-2")
//   → "bg05sfpr001-2-005-podkrepa-za-uchenitsi-s-talanti-2"
// Вътрешно процедурата се намира по стабилния КОД (началото на slug-а), не по
// текста на заглавието — така при смяна на заглавието старият slug пренасочва
// към новия, без процедурата да става недостъпна.

const TRANSLIT = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
  ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sht", ъ: "a", ь: "y", ю: "yu", я: "ya",
};

function translit(str) {
  let out = "";
  for (const ch of String(str).toLowerCase()) {
    if (Object.prototype.hasOwnProperty.call(TRANSLIT, ch)) out += TRANSLIT[ch];
    else out += ch;
  }
  return out;
}

// Общо нормализиране до slug сегмент: латиница/цифри, тирета, без празни краища.
function slugify(str, maxLen = 80) {
  let s = translit(str)
    .replace(/[._/\\]+/g, "-")     // точки/наклонени → тире
    .replace(/[^a-z0-9-]+/g, "-")  // всичко останало → тире
    .replace(/-+/g, "-")           // сбити тирета
    .replace(/^-|-$/g, "");        // без водещи/крайни тирета
  if (s.length > maxLen) s = s.slice(0, maxLen).replace(/-+$/g, "");
  return s;
}

// Нормализира кода за slug (BG05SFPR001-2.005 → bg05sfpr001-2-005).
export function codeSlug(code) {
  return slugify(code || "", 60);
}

// Пълен slug: код + заглавие.
export function procedureSlug(code, name) {
  const c = codeSlug(code);
  const n = slugify(name || "", 80);
  if (c && n) return `${c}-${n}`;
  return c || n || "";
}

// От slug извлича кодовата част (за търсене по код). Понеже кодът е в началото и
// съдържа само [a-z0-9-], сравняваме нормализирания код на всяка процедура с
// префикса на slug-а (Worker-ът итерира по кодовете от D1).
export function slugMatchesCode(slug, code) {
  const cs = codeSlug(code);
  const s = String(slug || "").toLowerCase();
  return !!cs && (s === cs || s.startsWith(cs + "-"));
}
