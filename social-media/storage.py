"""Cloudflare is the sole state authority, via REST or authenticated Wrangler."""
from contextlib import contextmanager
from datetime import datetime, timezone
import json
import os
import re
import subprocess
import time
from urllib.parse import quote
import uuid

from common import CONFIG, ROOT, HTTPFailure, json_request, request, redact


def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def wrangler(args):
    cli = ROOT.parent / 'node_modules/wrangler/bin/wrangler.js'
    if not cli.is_file():
        raise RuntimeError('Install npm dependencies for Wrangler or set CLOUDFLARE_API_TOKEN')
    env = dict(os.environ, CLOUDFLARE_ACCOUNT_ID=CONFIG['account_id'], CI='true', WRANGLER_SEND_METRICS='false')
    result = subprocess.run(['node', str(cli), *args], cwd=ROOT.parent, env=env,
                            capture_output=True, text=True, encoding='utf-8', timeout=120)
    if result.returncode:
        raise RuntimeError(redact(result.stderr or result.stdout))
    return result.stdout


def sql_literal(value):
    if value is None:
        return 'NULL'
    if isinstance(value, (int, float)):
        return str(value)
    # SQL escaping only; subprocess uses argv with shell=False.
    return "'" + str(value).replace("'", "''") + "'"


class Cloudflare:
    def __init__(self):
        self.api = f"https://api.cloudflare.com/client/v4/accounts/{CONFIG['account_id']}"
        self.token = os.environ.get('CLOUDFLARE_API_TOKEN')

    def query(self, sql, params=()):
        sql = re.sub(r'(?m)^\s*--[^\n]*', '', sql).strip()
        if self.token:
            # Some Cloudflare clients reject null parameters. Emit SQL NULL and
            # renumber the remaining binds without string-interpolating data.
            indexes = {}
            values = []
            def bind(match):
                i = int(match[1]) - 1
                if params[i] is None:
                    return 'NULL'
                if i not in indexes:
                    indexes[i] = len(values) + 1
                    values.append(params[i])
                return '?' + str(indexes[i])
            sql = re.sub(r'\?(\d+)', bind, sql)
            data, _ = json_request('POST', f"{self.api}/d1/database/{CONFIG['database_id']}/query",
                                  headers={'Authorization': f'Bearer {self.token}'},
                                  data={'sql': sql, 'params': values})
            if not data.get('success'):
                raise RuntimeError(redact(data.get('errors')))
            result = data['result']
        else:
            bound = re.sub(r'\?(\d+)', lambda m: sql_literal(params[int(m[1]) - 1]), sql)
            # Direct argv (shell=False), never a shell command. --file uses the D1
            # import API and does not return SELECT rows; use the query API here.
            result = json.loads(wrangler(['d1', 'execute', 'DB', '--config', str(ROOT.parent / 'wrangler.toml'),
                                         '--remote', '--json', '--command='+bound]))
        if not isinstance(result, list) or any(not item.get('success') for item in result):
            raise RuntimeError('D1 query failed')
        return result[-1].get('results', [])

    def history(self):
        rows = []
        while True:
            page = self.query('SELECT * FROM social_posts ORDER BY run_at DESC,id DESC LIMIT 500 OFFSET ?1', (len(rows),))
            rows.extend(page)
            if len(page) < 500:
                return rows

    def row(self, run_date):
        rows = self.query('SELECT * FROM social_posts WHERE run_date=?1', (run_date,))
        return rows[0] if rows else None

    def reserve(self, row, owner):
        fields = list(row)
        return self.query(f"INSERT INTO social_posts ({','.join(fields)}) SELECT " +
                          ','.join(f'?{i+1}' for i in range(len(fields))) +
                          f" WHERE EXISTS(SELECT 1 FROM social_publish_lock WHERE id=1 AND owner=?{len(fields)+1} AND expires_at > datetime('now')) " +
                          'ON CONFLICT(run_date) DO NOTHING RETURNING *', (*row.values(), owner))

    def update(self, run_date, **values):
        allowed = {'image_key', 'notes', 'linkedin_status', 'linkedin_url', 'linkedin_error',
                   'facebook_status', 'facebook_url', 'facebook_error'}
        if not set(values) <= allowed:
            raise ValueError('Unsupported history field')
        self.query('UPDATE social_posts SET ' + ','.join(f'{k}=?{i+1}' for i,k in enumerate(values)) +
                   f' WHERE run_date=?{len(values)+1}', (*values.values(), run_date))

    def claim(self, run_date, platform):
        if platform not in ('linkedin', 'facebook'):
            raise ValueError('Unknown platform')
        # One atomic claim immediately before a side effect. SENDING never auto-retries.
        return bool(self.query(f"UPDATE social_posts SET {platform}_status='SENDING', {platform}_error=NULL "
                               f"WHERE run_date=?1 AND {platform}_status IN ('PENDING','FAILED') RETURNING id", (run_date,)))

    def fail_pending(self, run_date, platform, error):
        if platform not in ('linkedin', 'facebook'):
            raise ValueError('Unknown platform')
        # A late preparation failure must never downgrade another runner's
        # in-flight claim or confirmed publication after a lease expires.
        self.query(f"UPDATE social_posts SET {platform}_status='FAILED', {platform}_error=?2 "
                   f"WHERE run_date=?1 AND {platform}_status IN ('PENDING','FAILED')", (run_date, redact(error)))

    @contextmanager
    def lock(self):
        owner = uuid.uuid4().hex
        rows = self.query("INSERT INTO social_publish_lock(id,owner,expires_at) VALUES(1,?1,datetime('now','+20 minutes')) "
                          "ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at "
                          "WHERE social_publish_lock.expires_at < datetime('now') RETURNING owner", (owner,))
        if not rows:
            raise RuntimeError('Another publishing run holds the Cloudflare lock')
        try:
            yield owner
        finally:
            self.query('DELETE FROM social_publish_lock WHERE id=1 AND owner=?1', (owner,))

    def snapshot(self, country):
        as_of = now()
        sql = (ROOT / 'changes.sql').read_text(encoding='utf-8')
        rows = []
        for days in (7, 14, 30):
            rows = self.query(sql, (country['data_code'], as_of, days))
            if len(rows) >= 2:
                break
        for row in rows:
            row['url'] = 'https://euro-funds.eu/procedures/' + quote(row['public_slug'] or row['id'], safe='')
        stats = self.query("SELECT COUNT(*) AS open_count, MIN(CASE WHEN date(deadline_date)>=date(?2) THEN deadline_date END) AS nearest_deadline "
                           "FROM public_projects WHERE country_code=?1 AND status IN ('open','closing_soon') "
                           "AND (date(deadline_date) IS NULL OR date(deadline_date)>=date(?2))", (country['data_code'], as_of))[0]
        return {'schema_version': 1, 'country': country['code'], 'data_country': country['data_code'],
                'fetched_at': as_of, 'days': days, 'procedures': rows, 'overview': stats,
                'source': 'cloudflare-d1', 'complete': True}

    def upload(self, path, key):
        base = CONFIG['media_base_url'].rstrip('/')
        if not base.startswith('https://'):
            raise RuntimeError('Configure the deployed media_base_url in config.json')
        content = path.read_bytes()
        if not content.startswith(b'\x89PNG\r\n\x1a\n') or len(content) > 24_000_000:
            raise ValueError('Invalid or oversized PNG')
        if self.token:
            data, _ = json_request('PUT', f"{self.api}/storage/kv/namespaces/{CONFIG['kv_namespace_id']}/values/{quote(key, safe='')}",
                                  headers={'Authorization': f'Bearer {self.token}', 'Content-Type': 'image/png'}, data=content)
            if not data.get('success'):
                raise RuntimeError(redact(data.get('errors')))
        else:
            wrangler(['kv','key','put',key,'--namespace-id',CONFIG['kv_namespace_id'],
                      '--remote','--path',str(path)])
        url = base + '/' + key
        # KV propagates asynchronously. Verify fetchability before handing URL to Meta.
        for attempt in range(8):
            try:
                body, headers = request('GET', url)
                if headers.get_content_type() == 'image/png' and body == content:
                    return url
            except HTTPFailure as exc:
                if exc.status != 404:
                    raise
            if attempt < 7:
                time.sleep(10)
        raise RuntimeError('Public PNG is not yet readable; retry the run later')
