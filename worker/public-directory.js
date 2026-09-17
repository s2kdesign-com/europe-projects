import { ensurePublicRoutes } from './public-routes.js';
import { procedurePath } from '../app/lib/public-url.js';
const esc = s => String(s || '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function directoryHtml(env) {
  await ensurePublicRoutes(env);
  const {results: countries} = await env.DB.prepare('SELECT country_code, COUNT(*) AS n FROM public_projects GROUP BY country_code ORDER BY country_code').all();
  const {results: recent} = await env.DB.prepare('SELECT id, public_slug, name FROM public_projects ORDER BY last_updated DESC LIMIT 6').all();
  return `<div style="max-width:1200px;margin:24px auto;padding:20px"><h2>Каталог на процедурите</h2><nav aria-label="Каталог"><a href="/procedures/programs">Програми</a> · ${['open','closing-soon','upcoming','closed'].map((s,i)=>`<a href="/procedures/status/${s}">${['Отворени','Изтичащи','Предстоящи','Архив'][i]}</a>`).join(' · ')}</nav><p>${countries.map(c=>`<a href="/procedures/countries/${esc(c.country_code.toLowerCase())}">${esc(c.country_code)} (${c.n})</a>`).join(' · ')}</p><ul>${recent.map(p=>`<li><a href="${procedurePath(p)}">${esc(p.name)}</a></li>`).join('')}</ul></div>`;
}
export async function injectDirectory(html, env) {
  if (!html.includes('id="public-directory"')) return html;
  return html.replace(/(<section id="public-directory"[^>]*>)[\s\S]*?<\/section>/, `$1${await directoryHtml(env)}</section>`);
}
