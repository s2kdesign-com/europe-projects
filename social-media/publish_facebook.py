"""Organic Facebook Page publishing only; no advertising endpoints."""
import os
import re
from common import json_request, required
from publishing import guarded_publish


def publish(store, row, image_url=None):
    # Validate configuration before claiming: a missing token cannot have published.
    token = required('FB_PAGE_ACCESS_TOKEN')
    page=required('FB_PAGE_ID')
    version=os.environ.get('FB_GRAPH_VERSION','v24.0')
    if not page.isdecimal() or not re.fullmatch(r'v\d+\.\d+',version) or int(version[1:].split('.')[0])<19:
        raise ValueError('Facebook numeric Page ID and Graph API version v19+ required')
    if row['kind']=='image' and not image_url:
        raise ValueError('Image URL required')
    def send():
        path='photos' if row['kind']=='image' else 'feed'
        data={'message':row['facebook_text']}
        if row['kind']=='image':
            data.update(url=image_url,published=True)
        else:
            data['link']=row['primary_link']
        result,_=json_request('POST',f'https://graph.facebook.com/{version}/{page}/{path}',
                             headers={'Authorization':'Bearer '+token},data=data)
        post_id=result.get('post_id') or result.get('id')
        if not post_id:
            raise RuntimeError('Facebook accepted request without a post ID; reconcile before retrying')
        return 'https://www.facebook.com/'+str(post_id)
    return guarded_publish(store,row,'facebook',send)
