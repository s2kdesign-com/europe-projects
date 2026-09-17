// WebMCP — инструменти на САМАТА СТРАНИЦА за агенти, които работят в браузъра
// (spec: https://webmachinelearning.github.io/webmcp/, Chrome EPP).
//
// Разликата спрямо `worker/agent/mcp.js`: там сървърът обслужва отдалечен агент
// през `POST /mcp`. Тук агентът е ВЪТРЕ в браузъра на потребителя — вижда
// отворения таб, сесията и избраната държава — и вика инструментите директно.
// Затова освен четенето има и две действия, които сървърният MCP не може да
// направи: отваряне на страницата на процедура и навигация в приложението.
//
// Регистрацията се прави с ИНЛАЙН скрипт в `<head>` (app/layout.jsx), защото:
//   1. Скенерите проверяват какво е налично „на page load", преди хидратацията;
//   2. Сайтът е статичен експорт — React бъндълът се зарежда чувствително
//      по-късно от първия рисунък.
// Понеже инлайн скрипт не може да импортира модули, целият bootstrap е една
// самостоятелна функция, която се сериализира с `Function.prototype.toString()`.
// ⚠️ Затова тя НЕ трябва да реферира нищо извън собственото си тяло (иначе
// минификаторът при билда ще пренапише име, което в HTML-а няма да съществува),
// и е писана нарочно в ES5 стил (var, без arrow/async) — сериализираният код
// върви и в стари browser-и, без regenerator помощници.

/** Имената на инструментите — единствен източник за тестове и документация. */
export const WEBMCP_TOOL_NAMES = [
  "search_procedures",
  "get_procedure",
  "list_countries",
  "list_sources",
  "platform_statistics",
  "open_procedure",
  "navigate_site",
];

/**
 * Регистрира инструментите на страницата в наличния WebMCP интерфейс.
 *
 * `scope` е само за тестове (fake window). В браузъра се вика без аргумент.
 * Връща обекта на състоянието (и го закача на `window.__WEBMCP__`), за да може
 * страницата — и всеки скенер — да провери какво е обявено.
 */
export function webmcpBootstrap(scope) {
  var G = scope || (typeof globalThis !== "undefined" ? globalThis : this);
  try {
    if (!G) return null;
    var doc = G.document || null;
    var loc = G.location || (doc && doc.location) || null;
    var origin = (loc && loc.origin) || "https://euro-funds.eu";

    // -----------------------------------------------------------------------
    // Помощни
    // -----------------------------------------------------------------------

    // Кодовете на процедурите са ASCII, затова тук стига опростен вариант на
    // `app/lib/slug.js#codeSlug` — без транслитерация на кирилица.
    function codeSlug(code, maxLen) {
      var s = String(code == null ? "" : code)
        .toLowerCase()
        .replace(/[._/\\]+/g, "-")
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      var cap = maxLen || 60;
      if (s.length > cap) s = s.slice(0, cap).replace(/-+$/g, "");
      return s;
    }

    function iso2(value) {
      var s = String(value == null ? "" : value).trim().toUpperCase();
      return /^[A-Z]{2}$/.test(s) ? s : null;
    }

    // Държавата, която потребителят гледа в момента: изричен аргумент →
    // guest предпочитание от localStorage (`app/lib/country/store.js`) → BG.
    function activeCountry(given) {
      var c = iso2(given);
      if (c) return c;
      try {
        var raw = G.localStorage && G.localStorage.getItem("eurofunds_country_v1");
        if (raw) {
          c = iso2((JSON.parse(raw) || {}).country);
          if (c) return c;
        }
      } catch (e) { /* private mode / забранен storage */ }
      return "BG";
    }

    // Езиковият префикс на текущия път (bg е без префикс) — за да не изхвърли
    // навигацията потребителя от езика, на който чете.
    function localePrefix() {
      var m = /^\/([a-z]{2})(?=\/|$)/.exec((loc && loc.pathname) || "/");
      return m && m[1] !== "bg" ? "/" + m[1] : "";
    }

    function get(path) {
      var f = G.fetch;
      if (typeof f !== "function") return Promise.reject(new Error("fetch is not available in this context."));
      return f(origin + path, { headers: { Accept: "application/json" }, credentials: "omit" }).then(function (res) {
        return res.json().then(
          function (body) {
            if (!res.ok || (body && body.ok === false)) {
              throw new Error("Request to " + path + " failed: " + ((body && body.error) || "HTTP " + res.status));
            }
            return body;
          },
          function () { throw new Error("Request to " + path + " returned a non-JSON response (HTTP " + res.status + ")."); }
        );
      });
    }

    // MCP-съвместим отговор: човешки четим текст + структурираните данни.
    function ok(value) {
      if (typeof value === "string") return { content: [{ type: "text", text: value }] };
      return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], structuredContent: value };
    }

    // Проблем в данните НЕ е изключение на инструмента — моделът трябва да го
    // прочете и да се коригира сам (същото поведение като сървърния MCP).
    function failed(err) {
      return { isError: true, content: [{ type: "text", text: (err && err.message) || String(err) }] };
    }

    function guard(fn) {
      return function (input) {
        try {
          return Promise.resolve(fn(input || {})).then(ok, failed);
        } catch (e) {
          return Promise.resolve(failed(e));
        }
      };
    }

    function goTo(path) {
      if (!loc) throw new Error("Navigation is not available in this context.");
      if (typeof loc.assign === "function") loc.assign(path);
      else loc.href = path;
      return path;
    }

    // Едно поле процедура → обект с готов адрес на страницата (агентът не бива
    // да гради URL от суровия идентификатор).
    function procedureOut(p) {
      return {
        id: p.id,
        name: p.name,
        url: origin + "/procedures/" + (p.public_slug || encodeURIComponent(p.id)),
        country_code: p.country_code,
        status: p.status,
        program: p.program,
        priority: p.priority,
        deadline: p.deadline,
        deadline_date: p.deadline_date,
        budget: p.budget,
        budget_amount_eur: p.budget_amount_eur == null ? null : p.budget_amount_eur,
        eligible: p.eligible,
        official_url: p.official_url || p.link || null,
        managing_authority: p.managing_authority,
        last_updated: p.last_updated,
      };
    }

    var COUNTRY_SCHEMA = {
      type: "string",
      pattern: "^[A-Za-z]{2}$",
      description: "ISO 3166-1 alpha-2 code. Omit to use the country the visitor is currently viewing.",
    };

    // -----------------------------------------------------------------------
    // Инструментите
    // -----------------------------------------------------------------------

    var TOOLS = [
      {
        name: "search_procedures",
        title: "Search funding procedures",
        description:
          "Search EU and national funding procedures for one country. Filter by free text, status and programme. " +
          "Returns the fields needed to answer without a second call, plus the page URL of each result. " +
          "A null budget means the source published no usable figure — it does NOT mean zero.",
        inputSchema: {
          type: "object",
          properties: {
            country: COUNTRY_SCHEMA,
            query: { type: "string", maxLength: 200, description: "Free text matched against the title, programme and eligible-applicants text." },
            status: { type: "string", enum: ["open", "closing_soon", "upcoming", "closed"], description: "Status as of the last sync." },
            program: { type: "string", maxLength: 200, description: "Operational programme name (exact match)." },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
          },
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        execute: guard(function (args) {
          var country = activeCountry(args.country);
          var limit = args.limit == null ? 25 : Number(args.limit);
          if (!isFinite(limit) || limit < 1 || limit > 100) throw new Error("`limit` must be an integer between 1 and 100.");
          if (args.status != null && args.status !== "" && ["open", "closing_soon", "upcoming", "closed"].indexOf(String(args.status)) === -1) {
            throw new Error("`status` must be one of: open, closing_soon, upcoming, closed.");
          }
          return get("/api/projects?country=" + encodeURIComponent(country)).then(function (body) {
            var rows = body.projects || [];
            if (args.status) {
              rows = rows.filter(function (p) { return p.status === args.status; });
            }
            if (args.program) {
              rows = rows.filter(function (p) { return p.program === args.program; });
            }
            if (args.query != null && String(args.query).trim() !== "") {
              var q = String(args.query).trim().toLowerCase();
              rows = rows.filter(function (p) {
                var hay = ((p.name || "") + " " + (p.program || "") + " " + (p.eligible || "")).toLowerCase();
                return hay.indexOf(q) > -1;
              });
            }
            return {
              country: country,
              matched: rows.length,
              procedures: rows.slice(0, Math.floor(limit)).map(procedureOut),
              note: "Status and deadlines are as of the last synchronisation, not this minute.",
            };
          });
        }),
      },

      {
        name: "get_procedure",
        title: "Read one procedure",
        description:
          "Read a single procedure with its analysed documents. Accepts the raw procedure id (e.g. BG05SFPR001-2.005) or the URL slug. " +
          "Document `summary` is a generated summary, not the document itself — send the user to `source_url` for the real guidelines.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", minLength: 1, maxLength: 300, description: "Procedure id or the URL slug." },
            country: COUNTRY_SCHEMA,
          },
          required: ["id"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        execute: guard(function (args) {
          var raw = String(args.id == null ? "" : args.id).trim();
          if (!raw) throw new Error("`id` is required.");
          return get("/api/project?id=" + encodeURIComponent(raw))
            .catch(function () {
              // Не е суров идентификатор → разпознаваме го като slug по кодовата част.
              var country = activeCountry(args.country);
              return get("/api/projects?country=" + encodeURIComponent(country)).then(function (body) {
                var want = codeSlug(raw, 300);
                var hit = (body.projects || []).filter(function (p) {
                  var cs = p.public_slug || codeSlug(p.id, 60);
                  return cs && want === cs;
                })[0];
                if (!hit) throw new Error("No procedure matches `" + raw + "` in " + country + ". Call search_procedures first.");
                return get("/api/project?id=" + encodeURIComponent(hit.id));
              });
            })
            .then(function (body) {
              return {
                procedure: procedureOut(body.project || {}),
                documents: (body.documents || []).map(function (d) {
                  return { id: d.id, title: d.title, doc_type: d.doc_type, source_url: d.source_url, summary: d.content };
                }),
              };
            });
        }),
      },

      {
        name: "list_countries",
        title: "List covered countries",
        description:
          "List the 27 EU member states with their coverage status, currency, source counts and last successful sync. " +
          "Call this before assuming a country has usable data.",
        inputSchema: {
          type: "object",
          properties: { enabledOnly: { type: "boolean", default: false, description: "Return only countries that passed QA and are switched on." } },
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        execute: guard(function (args) {
          return get("/api/countries").then(function (body) {
            var rows = body.countries || [];
            if (args.enabledOnly) rows = rows.filter(function (c) { return !!c.enabled; });
            return { count: rows.length, countries: rows };
          });
        }),
      },

      {
        name: "list_sources",
        title: "List official sources",
        description: "The official national and EU portals a country's procedures are compiled from, with their health and last check.",
        inputSchema: { type: "object", properties: { country: COUNTRY_SCHEMA }, additionalProperties: false },
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        execute: guard(function (args) {
          var country = activeCountry(args.country);
          return get("/api/sources?country=" + encodeURIComponent(country)).then(function (body) {
            return { country: country, meta: body.meta || null, sources: body.sources || [] };
          });
        }),
      },

      {
        name: "platform_statistics",
        title: "Coverage statistics",
        description:
          "The latest published daily snapshot: procedure counts, document and budget coverage per country. " +
          "Budget totals cover only procedures with a validated procedure-level figure — never treat a missing budget as zero.",
        inputSchema: { type: "object", properties: { country: COUNTRY_SCHEMA }, additionalProperties: false },
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        execute: guard(function (args) {
          var wanted = iso2(args.country);
          return get("/api/public/platform-statistics").then(function (body) {
            var rows = body.countries || [];
            if (wanted) rows = rows.filter(function (c) { return c.code === wanted; });
            return { generatedAt: body.generatedAt || null, summary: body.summary || null, countries: rows };
          });
        }),
      },

      {
        name: "open_procedure",
        title: "Open a procedure page",
        description:
          "Navigate this tab to a procedure's page so the visitor can see it. Use search_procedures first to get the id. " +
          "This changes what the visitor is looking at; it does not modify any data.",
        inputSchema: {
          type: "object",
          properties: { id: { type: "string", minLength: 1, maxLength: 300, description: "Procedure id or URL slug." } },
          required: ["id"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        execute: guard(function (args) {
          var raw = String(args.id == null ? "" : args.id).trim();
          if (!raw) throw new Error("`id` is required.");
          var slug = codeSlug(raw, 300);
          if (!slug) throw new Error("`" + raw + "` is not a usable procedure id.");
          return get("/api/project?id=" + encodeURIComponent(raw)).then(function(body) {
            if (!body.project) throw new Error("Procedure not found");
            return "Opened " + origin + goTo("/procedures/" + (body.project.public_slug || encodeURIComponent(body.project.id)));
          });
        }),
      },

      {
        name: "navigate_site",
        title: "Open a section of the site",
        description:
          "Navigate this tab to one of the site's sections, optionally pre-filling the procedures search. " +
          "Use it to show the visitor where an answer came from instead of only describing it.",
        inputSchema: {
          type: "object",
          properties: {
            section: {
              type: "string",
              enum: ["overview", "procedures", "calendar", "saved", "sources", "about", "how-ai-works", "changelog", "api-docs"],
              description: "Which section to open.",
            },
            query: { type: "string", maxLength: 200, description: "Only for `procedures` — pre-fills the search box." },
            status: { type: "string", enum: ["open", "closing_soon", "upcoming", "closed"], description: "Only for `procedures` — pre-selects the status filter." },
          },
          required: ["section"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        execute: guard(function (args) {
          var PATHS = {
            overview: "/",
            procedures: "/procedures",
            calendar: "/calendar",
            saved: "/saved",
            sources: "/sources",
            about: "/about",
            "how-ai-works": "/how-ai-works",
            changelog: "/changelog",
            "api-docs": "/docs/api",
          };
          var base = PATHS[String(args.section || "")];
          if (!base) throw new Error("`section` must be one of: " + Object.keys(PATHS).join(", ") + ".");
          var qs = [];
          if (base === "/procedures" && args.query) qs.push("q=" + encodeURIComponent(String(args.query)));
          if (base === "/procedures" && args.status) qs.push("status=" + encodeURIComponent(String(args.status)));
          var prefix = localePrefix();
          var path = (base === "/" ? prefix || "/" : prefix + base) + (qs.length ? "?" + qs.join("&") : "");
          return "Opened " + origin + goTo(path);
        }),
      },
    ];

    // -----------------------------------------------------------------------
    // Регистрация
    // -----------------------------------------------------------------------

    // Обявеното (без `execute`) — за скенери и за самата страница.
    var manifest = TOOLS.map(function (t) {
      return { name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations };
    });

    var state = G.__WEBMCP__ && G.__WEBMCP__.tools ? G.__WEBMCP__ : { tools: manifest, registered: false, surfaces: [] };
    state.tools = manifest;
    if (!state.surfaces) state.surfaces = [];
    G.__WEBMCP__ = state;
    G.__WEBMCP_TOOLS__ = manifest;

    // Двата интерфейса живеят на различни места според версията на спецификацията:
    // `navigator.modelContext` (Chrome EPP) и `document.modelContext` (W3C чернова).
    // Регистрираме и в двата, ако са различни обекти — така всеки агент вижда
    // инструментите, независимо къде ги търси.
    function contexts() {
      var found = [];
      var a = G.navigator && G.navigator.modelContext;
      if (a) found.push(a);
      var b = G.document && G.document.modelContext;
      if (b && found.indexOf(b) === -1) found.push(b);
      return found;
    }

    function provide(mc) {
      if (state.surfaces.indexOf(mc) > -1) return true;
      var done = false;
      if (typeof mc.provideContext === "function") {
        // Императивният API заменя целия набор наведнъж — вика се само веднъж.
        mc.provideContext({ tools: TOOLS });
        done = true;
      } else if (typeof mc.registerTool === "function") {
        for (var i = 0; i < TOOLS.length; i++) mc.registerTool(TOOLS[i]);
        done = true;
      }
      if (done) state.surfaces.push(mc);
      return done;
    }

    function register() {
      var list = contexts();
      var any = false;
      for (var i = 0; i < list.length; i++) {
        try { if (provide(list[i])) any = true; } catch (e) { /* един счупен интерфейс не спира другия */ }
      }
      if (any) state.registered = true;
      return state.registered;
    }
    state.register = register;

    // Ако интерфейсът още го няма (агентът може да го инжектира след първия
    // рисунък), опитваме отново в ограничен прозорец — без да предефинираме
    // `navigator.modelContext`, за да не засенчим истинската имплементация.
    if (!register()) {
      var tries = 0;
      var timer = null;
      var retry = function () {
        if ((register() || ++tries > 60) && timer != null && G.clearInterval) G.clearInterval(timer);
        return state.registered;
      };
      if (G.setInterval) timer = G.setInterval(retry, 250);
      if (doc && doc.addEventListener) doc.addEventListener("DOMContentLoaded", retry);
      if (G.addEventListener) {
        G.addEventListener("load", retry);
        G.addEventListener("modelcontextready", retry);
      }
    }

    return state;
  } catch (e) {
    // Готовността за агенти никога не бива да чупи страницата за хората.
    return null;
  }
}

/** Сериализираният bootstrap — точно това влиза в `<head>` като инлайн скрипт. */
export const WEBMCP_INIT_SCRIPT = "(" + webmcpBootstrap.toString() + ")();";
