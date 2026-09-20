"""LinkedIn organization Images + Posts APIs. Organic organization 145200865."""
import re
import time
from urllib.parse import quote, urlparse
from common import CONFIG, json_request, request, required
from publishing import guarded_publish


def publish(store,row,image_bytes=None):
    token = required('LINKEDIN_ACCESS_TOKEN')
    version=required('LINKEDIN_VERSION')
    if not re.fullmatch(r'20\d{4}',version):
        raise ValueError('LINKEDIN_VERSION must be a supported YYYYMM version')
    headers={'Authorization':'Bearer '+token,'LinkedIn-Version':version,'X-Restli-Protocol-Version':'2.0.0'}
    author='urn:li:organization:'+CONFIG['linkedin_organization']
    # Upload is not a post; retrying a failed upload cannot duplicate published content.
    if row['kind']=='image':
        if not image_bytes:
            raise ValueError('Image bytes required')
        result,_=json_request('POST','https://api.linkedin.com/rest/images?action=initializeUpload',headers=headers,
                             data={'initializeUploadRequest':{'owner':author}})
        upload=result['value']
        host=urlparse(upload['uploadUrl'])
        if host.scheme!='https' or not (host.hostname=='linkedin.com' or (host.hostname or '').endswith('.linkedin.com')):
            raise ValueError('Unexpected LinkedIn upload host')
        request('PUT',upload['uploadUrl'],headers={'Authorization':'Bearer '+token,'Content-Type':'image/png'},data=image_bytes)
        for attempt in range(12):
            image,_=json_request('GET','https://api.linkedin.com/rest/images/'+quote(upload['image'],safe=''),headers=headers)
            if image.get('status')=='AVAILABLE':
                break
            if image.get('status') in ('PROCESSING_FAILED','WAITING_UPLOAD'):
                raise RuntimeError('LinkedIn image is not processable')
            if attempt==11:
                raise RuntimeError('LinkedIn image processing timeout')
            time.sleep(3)
        content={'media':{'id':upload['image'],'title':row['topic']}}
    else:
        content={'article':{'source':row['primary_link'],'title':row['topic']}}
    def send():
        _,response_headers=json_request('POST','https://api.linkedin.com/rest/posts',headers=headers,data={
            'author':author,'commentary':row['linkedin_text'],'visibility':'PUBLIC',
            'distribution':{'feedDistribution':'MAIN_FEED','targetEntities':[],'thirdPartyDistributionChannels':[]},
            'content':content,'lifecycleState':'PUBLISHED','isReshareDisabledByAuthor':False})
        urn=response_headers.get('x-restli-id')
        if not urn:
            raise RuntimeError('LinkedIn response has no post URN; reconcile before retrying')
        return 'https://www.linkedin.com/feed/update/'+urn
    return guarded_publish(store,row,'linkedin',send)
