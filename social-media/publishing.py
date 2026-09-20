"""Atomic D1 per-platform guard, with conservative handling of uncertain delivery."""
import json
from common import HTTPFailure, redact
from localization import validate_saved_draft


def guarded_publish(store, row, platform, send):
    current = store.row(row['run_date'])
    if not current or current[platform+'_status'] not in ('PENDING', 'FAILED'):
        return current
    validate_saved_draft(current)
    if not store.claim(row['run_date'], platform):
        return store.row(row['run_date'])
    try:
        url = send()
    except HTTPFailure as exc:
        # A server error/timeout can follow a committed post. Never automatically replay.
        ambiguous = exc.status >= 500 or exc.status in (408,409)
        status = 'UNCERTAIN' if ambiguous else 'FAILED'
        store.update(row['run_date'], **{platform+'_status':status,
            platform+'_error':json.dumps({'message':redact(exc),'needs_reconciliation':ambiguous})})
    except Exception as exc:
        store.update(row['run_date'], **{platform+'_status':'UNCERTAIN',
            platform+'_error':json.dumps({'message':redact(exc),'needs_reconciliation':True})})
    else:
        # If this write fails, the persisted SENDING guard still prevents another POST.
        store.update(row['run_date'], **{platform+'_status':'SUCCESS',platform+'_url':url,platform+'_error':None})
    return store.row(row['run_date'])
