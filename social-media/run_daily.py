"""One EU country per day. Cloud history is authoritative; dry-run has no writes."""
import argparse
from contextlib import nullcontext
from datetime import date, datetime, timezone
import json
from pathlib import Path
import sys
import uuid

from common import CONFIG, ROOT, redact, request
from compose import COUNTRIES, cadence, compose, country_for, validate_snapshot
from make_image import make_image
from storage import Cloudflare, now
import publish_facebook
import publish_linkedin


def report(row, country, content, dry_run=False):
    description = 'evergreen fallback' if content['evergreen'] else f"{len(content['used'])} procedures (last {content['days']} days)"
    print('Euro-Funding Daily Social Publishing')
    print(f"Date: {row['run_date']}")
    print(f"Country: {country['name_en']} ({country['code']}) — language {row['language']}")
    print('Changes used: '+description)
    print('Visual: '+ ('image '+str(row.get('image_key') or '(local preview)') if row['kind']=='image' else 'link-only'))
    for platform in ('linkedin','facebook'):
        status='DRY_RUN — not published' if dry_run else row[platform+'_status']
        label = 'LinkedIn' if platform == 'linkedin' else 'Facebook'
        print(f"{label}: {status}")
    print('Post URLs: '+ (' | '.join(row.get(p+'_url') or '' for p in ('linkedin','facebook')).strip(' |') or 'none'))
    if dry_run:
        print('\nLinkedIn composed post:\n'+row['linkedin_text'])
        print('\nFacebook composed post:\n'+row['facebook_text'])


def run(args, store=None):
    store=store or Cloudflare()
    if args.prepare:
        history=store.history()
        country=country_for(history,args.date,args.country)
        existing=store.row(args.date)
        kind,scene=(existing['kind'],existing['scene']) if existing else cadence(history,country['code'])
        print(json.dumps({'country':country,'as_of':now(),'kind':kind,'scene':scene,
                          'existing':existing,'history_rows':len(history)},ensure_ascii=False))
        return 0
    with nullcontext(None) if args.dry_run else store.lock() as owner:
        history=store.history()
        country=country_for(history,args.date,args.country)
        row=store.row(args.date)
        if row:
            saved=json.loads(row['changes_json'])
            content=saved['content']
        else:
            if history and args.date < history[0]['run_date'] and not args.dry_run:
                raise ValueError('Cannot insert an out-of-order historical run; use dry-run')
            snapshot=json.loads(Path(args.changes).read_text(encoding='utf-8-sig')) if args.changes else store.snapshot(country)
            validate_snapshot(snapshot,country)
            kind,scene=cadence(history,country['code'])
            content=compose(country,snapshot,kind,history,args.date)
            row={'id':uuid.uuid4().hex,'run_date':args.date,'run_at':now(),'country':country['code'],
                 'language':country['language'],'topic':content['headline'],'kind':kind,'primary_link':country['url'],
                 'image_key':None,'scene':scene,'changes_json':json.dumps({
                     'snapshot':{**snapshot,'procedures':content['used'], 'matched':len(snapshot['procedures'])},
                     'content':content},ensure_ascii=False),
                 'linkedin_status':'PENDING','facebook_status':'PENDING',
                 'linkedin_text':content['linkedin'],'facebook_text':content['facebook'],
                 'notes':json.dumps({'omitted_for_length':content['omitted']})}
            if not args.dry_run:
                reserved=store.reserve(row,owner)
                if not reserved:
                    raise RuntimeError('Run reservation lost; no publishing attempted')
        image_path=ROOT/'images'/f"{args.date}-{country['code']}.png"
        if args.dry_run:
            if row['kind']=='image':
                make_image(image_path,country,row['language'],content['headline'],content['subtitle'],
                           row['primary_link'],row['scene'],no_ai=True)
            report(row,country,content,True)
            return 0
        pending=[p for p in ('linkedin','facebook') if row[p+'_status'] in ('PENDING','FAILED')]
        if not pending:
            report(row,country,content)
            return 0 if all(row[p+'_status']=='SUCCESS' for p in ('linkedin','facebook')) else 1
        image_url=None
        image_bytes=None
        if row['kind']=='image':
            try:
                if row.get('image_key'):
                    image_url=CONFIG['media_base_url'].rstrip('/')+'/'+row['image_key']
                    image_bytes,_=request('GET',image_url)
                    if not image_bytes.startswith(b'\x89PNG\r\n\x1a\n'):
                        raise ValueError('Saved image is not a PNG')
                else:
                    result=make_image(image_path,country,row['language'],content['headline'],content['subtitle'],
                                      row['primary_link'],row['scene'],no_ai=args.no_ai)
                    key=f"{args.date}/{country['code']}-{row['id']}.png"
                    image_url=store.upload(image_path,key)
                    image_bytes=image_path.read_bytes()
                    store.update(args.date,image_key=key,notes=json.dumps({'image_source':result['source'],
                                 'omitted_for_length':content['omitted']}))
            except Exception as exc:
                for platform in pending:
                    store.fail_pending(args.date,platform,exc)
                report(store.row(args.date),country,content)
                return 1
        for platform in pending:
            try:
                if platform=='linkedin':
                    publish_linkedin.publish(store,row,image_bytes)
                else:
                    publish_facebook.publish(store,row,image_url)
            except Exception as exc:
                # Pre-publish setup failures are safely retryable. A SENDING record is
                # retained if the remote post may exist but its success write failed.
                store.fail_pending(args.date,platform,exc)
        row=store.row(args.date)
        report(row,country,content)
        return 0 if all(row[p+'_status']=='SUCCESS' for p in ('linkedin','facebook')) else 1


def main():
    if hasattr(sys.stdout,'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--date',default=datetime.now(timezone.utc).date().isoformat())
    p.add_argument('--country',choices=[c['code'] for c in COUNTRIES])
    p.add_argument('--dry-run',action='store_true')
    p.add_argument('--no-ai',action='store_true')
    p.add_argument('--changes',help='Fresh connector result envelope; never used as history')
    p.add_argument('--prepare',action='store_true',help='Read cloud history and print next country for connector queries')
    args=p.parse_args()
    date.fromisoformat(args.date)
    try:
        return run(args)
    except Exception as exc:
        print('Publishing stopped: '+redact(exc),file=sys.stderr)
        return 1


if __name__=='__main__':
    raise SystemExit(main())
