"""D1 handoff for Chrome connector publishing; this module never controls a browser."""
import argparse
from datetime import date
import json
import re
import sys
from urllib.parse import parse_qs, urlsplit
import uuid

from common import ROOT, redact
from storage import Cloudflare
from localization import validate_saved_draft

TARGETS = {
    'facebook': {'url': 'https://www.facebook.com/euro.funds.eu/',
                 'author': 'Euro-Funds.eu - EU Funding & Grants'},
    'linkedin': {'url': 'https://www.linkedin.com/feed/',
                 'company_url': 'https://www.linkedin.com/company/145200865/admin/',
                 'author': 'Euro-Funds | EU Funding & Grants'},
}


def draft(row):
    if not row:
        raise ValueError('No reserved draft for this date')
    image = ROOT/'images'/f"{row['run_date']}-{row['country']}.png"
    return {'transport': 'chrome-connector', 'run_date': row['run_date'],
            'country': row['country'], 'kind': row['kind'],
            'image_path': str(image.resolve()) if row['kind'] == 'image' else None,
            'platforms': {p: {**target, 'status': row[p+'_status'],
                             'text': row[p+'_text'], 'post_url': row.get(p+'_url')}
                          for p,target in TARGETS.items()}}


def valid_permalink(platform, url):
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.port:
        return False
    if platform == 'linkedin':
        return parsed.hostname == 'www.linkedin.com' and bool(re.fullmatch(
            r'/(?:feed/update/urn:li:(?:activity|share|ugcPost):\d+/?|posts/[^/]+)', parsed.path))
    if parsed.hostname not in ('www.facebook.com','facebook.com'):
        return False
    if parsed.path in ('/permalink.php','/story.php'):
        query = parse_qs(parsed.query)
        return bool(query.get('story_fbid') and query.get('id'))
    if parsed.path in ('/photo','/photo/','/photo.php'):
        return bool(parse_qs(parsed.query).get('fbid'))
    return bool(re.fullmatch(r'/[^/]+/(?:posts|photos)/[^/]+/?', parsed.path))


def claim(store, run_date, platform, author):
    if platform not in TARGETS or author != TARGETS[platform]['author']:
        raise ValueError('Composer author does not match the Euro-Funds target')
    row = store.row(run_date)
    if not row or row[platform+'_status'] not in ('PENDING', 'FAILED'):
        raise ValueError('Claim refused: missing draft or delivery already claimed/completed')
    validate_saved_draft(row)
    attempt = uuid.uuid4().hex
    rows = store.query(f"UPDATE social_posts SET {platform}_status='SENDING', {platform}_error=?2 "
                       f"WHERE run_date=?1 AND {platform}_status IN ('PENDING','FAILED') "
                       "AND (kind='link' OR image_key IS NOT NULL) RETURNING id",
                       (run_date, 'browser:'+attempt))
    if not rows:
        raise ValueError('Claim refused: missing draft/image or delivery already claimed/completed')
    return {'attempt': attempt, 'status': 'SENDING', 'instruction': 'Click Post once; verify author and permalink; record immediately.'}


def finish(store, run_date, platform, attempt, status, url=None, error=None):
    if platform not in TARGETS or status not in ('SUCCESS','UNCERTAIN'):
        raise ValueError('Unsupported browser delivery result')
    if not re.fullmatch(r'[a-f0-9]{32}', attempt):
        raise ValueError('Invalid browser attempt')
    if status == 'SUCCESS' and (not url or not valid_permalink(platform, url)):
        raise ValueError('A verified platform post permalink is required')
    rows = store.query(f"UPDATE social_posts SET {platform}_status=?3, {platform}_url=?4, {platform}_error=?5 "
                       f"WHERE run_date=?1 AND {platform}_status='SENDING' AND {platform}_error=?2 RETURNING id",
                       (run_date, 'browser:'+attempt, status, url if status=='SUCCESS' else None,
                        None if status=='SUCCESS' else redact(error or 'Browser outcome needs reconciliation')))
    if not rows:
        raise ValueError('Result refused: attempt does not own an in-flight browser claim')
    return {'platform': platform, 'status': status, 'url': url if status=='SUCCESS' else None}


def main():
    if hasattr(sys.stdout,'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('show','claim','record','report'))
    parser.add_argument('--date', required=True)
    parser.add_argument('--platform', choices=tuple(TARGETS))
    parser.add_argument('--author', help='Exact author visibly verified in the composer')
    parser.add_argument('--attempt', help='Identifier returned by claim; not a credential')
    parser.add_argument('--status', choices=('SUCCESS','UNCERTAIN'))
    parser.add_argument('--url')
    parser.add_argument('--error')
    args = parser.parse_args()
    try:
        date.fromisoformat(args.date)
        store = Cloudflare()
        if args.action=='claim':
            result = claim(store,args.date,args.platform,args.author)
        elif args.action=='record':
            result = finish(store,args.date,args.platform,args.attempt or '',args.status,args.url,args.error)
        elif args.action=='report':
            from run_daily import report
            from compose import country_for
            row = store.row(args.date)
            if not row:
                raise ValueError('No reserved draft for this date')
            report(row,country_for([row],args.date),json.loads(row['changes_json'])['content'])
            return 0
        else:
            result = draft(store.row(args.date))
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except Exception as exc:
        print('Browser publishing stopped: '+redact(exc), file=sys.stderr)
        return 1


if __name__=='__main__':
    raise SystemExit(main())
