"""Native-language copy with reviewed translations and unchanged structured facts."""
from datetime import datetime, timedelta, timezone
import json
from urllib.parse import urlparse

from common import ROOT
from localization import localized_fields

COUNTRIES = json.loads((ROOT / 'countries.json').read_text(encoding='utf-8'))
LOCALES = json.loads((ROOT / 'locales.json').read_text(encoding='utf-8'))
ENGLISH_LINE = 'Daily EU funding calls for all 27 countries: euro-funds.eu'


def timestamp(value):
    result = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    return result.replace(tzinfo=timezone.utc) if result.tzinfo is None else result


def country_for(history, run_date, override=None):
    today = next((r for r in history if r['run_date'] == run_date), None)
    if today and override and today['country'] != override:
        raise ValueError('A different country is already reserved for this date')
    codes = [c['code'] for c in COUNTRIES]
    code = today['country'] if today else override
    if not code:
        code = codes[(codes.index(history[0]['country']) + 1) % len(codes)] if history else codes[0]
    country = dict(next(c for c in COUNTRIES if c['code'] == code))
    visits = sum(r['country'] == code and r['run_date'] != run_date for r in history)
    if code == 'BE' and ((today and today['language'] == 'nl') or (not today and visits % 2)):
        country.update(country['alternate'])
    return country


def cadence(history, country):
    kind = 'link' if (len(history) + 1) % 3 == 0 else 'image'
    images = [r for r in history if r['country'] == country and r['kind'] == 'image']
    used = {i: next((n for n,r in enumerate(images) if r['scene'] == i), len(images)+1) for i in range(3)}
    candidates = [i for i in range(3) if not images or i != images[0]['scene']]
    scene = max(candidates, key=lambda i: (used[i], -i))
    return kind, scene if kind == 'image' else None


def validate_snapshot(snapshot, country, current=None):
    current = current or datetime.now(timezone.utc)
    if snapshot.get('source') != 'cloudflare-d1' or snapshot.get('complete') is not True:
        raise ValueError('A complete live Cloudflare D1 snapshot is required')
    if snapshot.get('country') != country['code'] or snapshot.get('data_country') != country['data_code']:
        raise ValueError('Snapshot country mismatch')
    fetched = timestamp(snapshot['fetched_at'])
    age = (current - fetched).total_seconds()
    if age < -60 or age > 3600:
        raise ValueError('Snapshot must have been fetched during this run (less than one hour old)')
    if snapshot.get('days') not in (7,14,30):
        raise ValueError('Invalid lookback window')
    for p in snapshot['procedures']:
        if p['country_code'] != country['data_code'] or not p.get('title'):
            raise ValueError('Invalid procedure country or title')
        change = timestamp(p['change_time'])
        if not fetched - timedelta(days=snapshot['days']) <= change <= fetched:
            raise ValueError('Procedure is outside the declared time window')
        u = urlparse(p['url'])
        if u.scheme != 'https' or u.netloc != 'euro-funds.eu' or not u.path.startswith('/procedures/'):
            raise ValueError('Procedure must have a canonical euro-funds.eu detail URL')
    if not snapshot['procedures']:
        if snapshot['days'] != 30:
            raise ValueError('Evergreen needs the full 30-day search')
        count = snapshot['overview'].get('open_count')
        if not isinstance(count, int) or count < 0:
            raise ValueError('Evergreen needs a live open count')


def select_procedures(snapshot):
    today = timestamp(snapshot['fetched_at']).date().isoformat()
    def rank(p):
        deadline = p.get('deadline_date') or '9999-12-31'
        # Never interpret an elapsed deadline as a future urgent call.
        if deadline < today:
            deadline = '9999-12-31'
        return (-int(bool(p.get('is_new'))), deadline, -timestamp(p['change_time']).timestamp(), p['id'])
    return sorted(snapshot['procedures'], key=rank)


def procedure_line(p, labels, language):
    translated = localized_fields(p, language)
    fields = [translated['title'], f"{labels['deadline']}: {p.get('deadline_date') or labels['unknown']}"]
    if p.get('budget') not in (None, ''):
        fields.append(translated['budget'])
    fields.append(f"{labels['applicants']}: {translated.get('applicants') or labels['unknown']}")
    return '• ' + ' · '.join(fields) + '\n' + p['url']


def compose(country, snapshot, kind, history, run_date):
    labels = LOCALES[country['language']]
    rows = select_procedures(snapshot)
    recent = labels['week'] if snapshot['days'] == 7 else labels['recent'].format(days=snapshot['days'])
    hook = f"{country['name_native']} — {recent}"
    if kind == 'link':
        hook = country['url'] + '\n' + hook
    if country.get('greeting'):
        hook += '\n' + country['greeting']
    week_start = timestamp(snapshot['fetched_at']) - timedelta(days=7)
    if not any(timestamp(p['change_time']) >= week_start for p in rows):
        hook += '\n' + labels['no_week']
    ending = labels['track'] + '\n' + labels['cta'] + ': ' + country['url'] + '\n' + ' '.join(country['hashtags'])
    if not rows:
        overview = snapshot['overview']
        lines = [labels['open'].format(count=overview['open_count'])]
        if overview.get('nearest_deadline'):
            lines.append(labels['nearest'].format(deadline=overview['nearest_deadline']))
        body = '\n'.join(lines)
        used = []
    else:
        # Fit whole records, not fabricated summaries or truncated budgets/applicants.
        used = []
        for p in rows:
            candidate = used + [p]
            body = '\n'.join(procedure_line(x, labels, country['language']) for x in candidate)
            if len(hook + '\n\n' + body + '\n\n' + ending) <= 1000:
                used = candidate
            if len(used) == 3:
                break
        if not used:
            raise ValueError('No complete procedure fits the post limit; editorial action required; do not invent or truncate facts')
        body = '\n'.join(procedure_line(p, labels, country['language']) for p in used)
    facebook = hook + '\n\n' + body + '\n\n' + ending
    linkedin = facebook + '\n' + ENGLISH_LINE
    if len(facebook) > 1000 or len(linkedin) > 1300:
        raise ValueError('Post exceeds platform copy limit')
    headline = labels['headline'] + ' · ' + run_date
    previous = {r.get('topic') for r in history if r['country'] == country['code']}
    if headline in previous:
        raise ValueError('Headline already used for this country')
    return {'facebook': facebook, 'linkedin': linkedin, 'headline': headline,
            'language': country['language'], 'localization_version': 1,
            'subtitle': f"{country['name_native']} · {recent}", 'used': used,
            'omitted': len(rows)-len(used), 'days': snapshot['days'], 'evergreen': not rows}
