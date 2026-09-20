"""Read D1 history for humans. The publisher never imports this export."""
import argparse
import json
from pathlib import Path
from storage import Cloudflare

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--out',default='social-media/history-export.json')
    args=p.parse_args()
    rows=Cloudflare().history()
    Path(args.out).write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'out':str(Path(args.out).resolve()),'rows':len(rows)}))
