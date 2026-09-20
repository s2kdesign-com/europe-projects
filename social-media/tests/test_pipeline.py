import argparse
from copy import deepcopy
from datetime import datetime, timezone, timedelta
import json
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from common import ROOT, HTTPFailure, redact
from compose import COUNTRIES, LOCALES, cadence, compose, country_for, validate_snapshot
from make_image import font, fit, make_image
from publishing import guarded_publish
from storage import Cloudflare, sql_literal
from run_daily import run
from PIL import Image, ImageDraw
import publish_facebook
import publish_linkedin


def country(code):
    return next(c for c in COUNTRIES if c['code']==code)


def fixture(code='BG', days=7, empty=False):
    c=country(code)
    titles={'BG':'Иновации за предприятия','EL':'Καινοτομία για επιχειρήσεις','PL':'Rozwój przedsiębiorstw'}
    as_of=datetime.now(timezone.utc).replace(microsecond=0)
    return {'source':'cloudflare-d1','complete':True,'country':code,'data_country':c['data_code'],
        'schema_version':1,'fetched_at':as_of.isoformat(),'days':days,
        'overview':{'open_count':4,'nearest_deadline':'2026-12-15'},
        'procedures':[] if empty else [{
            'id':code+'-fixture','title':titles.get(code,'Synthetic test call'),'country_code':c['data_code'],
            'deadline_date':'2026-12-15','budget':'EUR 12 345','applicants':'SME',
            'url':'https://euro-funds.eu/procedures/test-'+code.lower(),'change_time':as_of.isoformat(),'is_new':1}]}


class SQLiteStore(Cloudflare):
    def __init__(self, path=':memory:'):
        self.db=sqlite3.connect(path,isolation_level=None)
        self.db.row_factory=sqlite3.Row
        self.db.executescript((ROOT.parent/'migrations/0037_social_posts.sql').read_text(encoding='utf-8'))
    def query(self,sql,params=()):
        return [dict(r) for r in self.db.execute(sql,params).fetchall()]


def reservation(store):
    c=country('BG'); snap=fixture(); text=compose(c,snap,'link',[],'2026-09-20')
    row={'id':'fixture','run_date':'2026-09-20','run_at':'2026-09-20T09:00:00Z','country':'BG','language':'bg',
         'topic':text['headline'],'kind':'link','primary_link':c['url'],'scene':None,
         'changes_json':json.dumps({'snapshot':snap,'content':text}),
         'linkedin_status':'PENDING','facebook_status':'PENDING','linkedin_text':text['linkedin'],'facebook_text':text['facebook']}
    with store.lock() as owner:
        assert store.reserve(row,owner)
    return row


class ContentTests(unittest.TestCase):
    def test_all_countries_languages_and_greece(self):
        self.assertEqual(len(COUNTRIES),27)
        self.assertEqual(len({c['iso_code'] for c in COUNTRIES}),27)
        self.assertEqual(country('EL')['data_code'],'GR')
        for c in COUNTRIES:
            self.assertIn(c['language'],LOCALES)
            self.assertEqual(len(c['scenes']),3)
            self.assertEqual(len(c['hashtags']),4)

    def test_three_native_language_fixtures_preserve_facts(self):
        for code in ('BG','EL','PL'):
            snap=fixture(code); validate_snapshot(snap,country(code))
            result=compose(country(code),snap,'image',[],'2026-09-20')
            for platform,limit in [('facebook',1000),('linkedin',1300)]:
                self.assertLessEqual(len(result[platform]),limit)
                for fact in ('title','budget','applicants','deadline_date','url'):
                    self.assertIn(snap['procedures'][0][fact],result[platform])

    def test_link_first_line_and_maltese_greeting(self):
        result=compose(country('MT'),fixture('MT'),'link',[],'2026-09-20')
        self.assertEqual(result['facebook'].splitlines()[0],country('MT')['url'])
        self.assertIn('Merħba, Malta!',result['facebook'])

    def test_evergreen_live_count_and_no_changes(self):
        snap=fixture(days=30,empty=True)
        result=compose(country('BG'),snap,'link',[],'2026-09-20')
        self.assertTrue(result['evergreen'])
        self.assertIn('Отворени процедури: 4',result['facebook'])
        self.assertIn(LOCALES['bg']['no_week'],result['facebook'])
        self.assertIn('2026-12-15',result['facebook'])

    def test_old_changes_do_not_claim_this_week(self):
        snap=fixture(days=14)
        snap['procedures'][0]['change_time']=(datetime.now(timezone.utc)-timedelta(days=10)).isoformat()
        result=compose(country('BG'),snap,'image',[],'2026-09-20')
        self.assertIn('(14 дни)',result['facebook'])
        self.assertIn(LOCALES['bg']['no_week'],result['facebook'])

    def test_long_call_is_omitted_whole(self):
        snap=fixture(); huge=deepcopy(snap['procedures'][0]); huge['title']='X'*1600; huge['id']='huge'
        snap['procedures'].insert(0,huge)
        result=compose(country('BG'),snap,'image',[],'2026-09-20')
        self.assertEqual(len(result['used']),1)
        self.assertNotIn('X'*5,result['facebook'])

    def test_impossible_call_fails_without_fake_evergreen(self):
        snap=fixture(); snap['procedures'][0]['title']='X'*1600
        with self.assertRaisesRegex(ValueError,'No complete procedure'):
            compose(country('BG'),snap,'image',[],'2026-09-20')

    def test_stale_cross_country_and_bad_url_rejected(self):
        for mutate in (
            lambda s:s.update(fetched_at='2020-01-01T00:00:00Z'),
            lambda s:s.update(data_country='GR'),
            lambda s:s.update(complete=False),
            lambda s:s['procedures'][0].update(url='https://evil.example/procedures/a'),
            lambda s:s['procedures'][0].update(change_time='2000-01-01'),
        ):
            snap=fixture(); mutate(snap)
            with self.assertRaises(ValueError): validate_snapshot(snap,country('BG'))

    def test_zero_counts_are_valid_but_missing_counts_are_not(self):
        snap=fixture(days=30,empty=True); snap['overview']['open_count']=0
        validate_snapshot(snap,country('BG'))
        snap['overview']['open_count']=None
        with self.assertRaises(ValueError): validate_snapshot(snap,country('BG'))


class RotationTests(unittest.TestCase):
    def test_cadence(self):
        history=[]
        for n in range(9):
            kind,scene=cadence(history,'BG')
            self.assertEqual(kind,'link' if n%3==2 else 'image')
            history.insert(0,{'country':'BG','kind':kind,'scene':scene})
        images=[r['scene'] for r in history if r['kind']=='image']
        self.assertTrue(all(a!=b for a,b in zip(images,images[1:])))
        self.assertEqual(set(images),{0,1,2})

    def test_rotation_wrap_and_retry(self):
        self.assertEqual(country_for([],'2026-09-20')['code'],'DE')
        history=[{'country':'MT','run_date':'2026-09-19'}]
        self.assertEqual(country_for(history,'2026-09-20')['code'],'DE')
        self.assertEqual(country_for(history,'2026-09-19')['code'],'MT')
        with self.assertRaises(ValueError): country_for(history,'2026-09-19','BG')

    def test_belgium_alternation(self):
        history=[{'country':'BE','run_date':'2026-08-23','language':'fr'}]
        self.assertEqual(country_for(history,'2026-09-20','BE')['language'],'nl')
        history.insert(0,{'country':'BE','run_date':'2026-09-20','language':'nl'})
        self.assertEqual(country_for(history,'2026-09-20')['language'],'nl')
        self.assertEqual(country_for(history,'2026-10-17','BE')['language'],'fr')

    def test_duplicate_headline_rejected(self):
        snap=fixture(); first=compose(country('BG'),snap,'image',[],'2026-09-20')
        with self.assertRaises(ValueError):
            compose(country('BG'),snap,'image',[{'country':'BG','topic':first['headline']}],'2026-09-20')


class DeliveryTests(unittest.TestCase):
    def setUp(self):
        self.store=SQLiteStore(); self.row=reservation(self.store)
    def tearDown(self): self.store.db.close()

    def test_success_retry_sends_once(self):
        calls=[]
        send=lambda: calls.append(1) or 'https://example.com/post'
        for _ in range(2): guarded_publish(self.store,self.row,'facebook',send)
        self.assertEqual(calls,[1])

    def test_timeout_is_not_replayed_other_platform_continues(self):
        def fail(): raise TimeoutError('timeout')
        guarded_publish(self.store,self.row,'linkedin',fail)
        self.assertEqual(self.store.row(self.row['run_date'])['linkedin_status'],'UNCERTAIN')
        self.assertFalse(self.store.claim(self.row['run_date'],'linkedin'))
        guarded_publish(self.store,self.row,'facebook',lambda:'https://example.com/fb')
        self.assertEqual(self.store.row(self.row['run_date'])['facebook_status'],'SUCCESS')

    def test_4xx_failed_and_5xx_uncertain(self):
        for status,platform,expected in [(403,'linkedin','FAILED'),(503,'facebook','UNCERTAIN')]:
            def fail(): raise HTTPFailure(status,'rejected')
            guarded_publish(self.store,self.row,platform,fail)
            self.assertEqual(self.store.row(self.row['run_date'])[platform+'_status'],expected)

    def test_crash_after_claim_blocks_replay(self):
        self.assertTrue(self.store.claim(self.row['run_date'],'facebook'))
        self.assertFalse(self.store.claim(self.row['run_date'],'facebook'))

    def test_late_preparation_error_cannot_downgrade_delivery(self):
        guarded_publish(self.store,self.row,'facebook',lambda:'https://example.com/post')
        self.store.claim(self.row['run_date'],'linkedin')
        for platform in ('facebook','linkedin'):
            self.store.fail_pending(self.row['run_date'],platform,'late image failure')
        row=self.store.row(self.row['run_date'])
        self.assertEqual(row['facebook_status'],'SUCCESS')
        self.assertEqual(row['linkedin_status'],'SENDING')

    def test_cloud_write_failure_after_publish_keeps_guard(self):
        with patch.object(self.store,'update',side_effect=RuntimeError('D1 outage')):
            with self.assertRaises(RuntimeError):
                guarded_publish(self.store,self.row,'facebook',lambda:'https://example.com/post')
        self.assertFalse(self.store.claim(self.row['run_date'],'facebook'))

    def test_lock_excludes_second_runner_and_date_unique(self):
        with self.store.lock() as owner:
            with self.assertRaises(RuntimeError):
                with self.store.lock(): pass
            self.assertEqual(self.store.reserve(self.row,owner),[])

    def test_facebook_photo_and_link_payload(self):
        with patch.dict(os.environ,{'FB_PAGE_ID':'123','FB_PAGE_ACCESS_TOKEN':'synthetic-secret'}):
            with patch('publish_facebook.json_request',return_value=({'id':'123_456'},{})) as req:
                publish_facebook.publish(self.store,self.row)
                self.assertIn('/feed',req.call_args.args[1])
                self.assertIn('link',req.call_args.kwargs['data'])

    def test_linkedin_article_headers(self):
        with patch.dict(os.environ,{'LINKEDIN_ACCESS_TOKEN':'synthetic-secret','LINKEDIN_VERSION':'202606'}):
            with patch('publish_linkedin.json_request',return_value=({}, {'x-restli-id':'urn:li:share:1'})) as req:
                publish_linkedin.publish(self.store,self.row)
                payload=req.call_args.kwargs['data']
                self.assertEqual(payload['author'],'urn:li:organization:145200865')
                self.assertEqual(payload['content']['article']['source'],self.row['primary_link'])
                self.assertEqual(payload['distribution']['feedDistribution'],'MAIN_FEED')


class ImageAndSafetyTests(unittest.TestCase):
    def test_rest_emits_null_literal_and_retains_bound_values(self):
        with patch.dict(os.environ,{'CLOUDFLARE_API_TOKEN':'test-secret-value'}):
            store=Cloudflare()
        with patch('storage.json_request',return_value=({'success':True,'result':[{'success':True,'results':[]}]},{})) as req:
            store.query('SELECT ?1, ?2, ?3, ?1',('quoted value',None,42))
            self.assertEqual(req.call_args.kwargs['data'],{'sql':'SELECT ?1, NULL, ?2, ?1','params':['quoted value',42]})

    def test_model_error_falls_back_then_gradient(self):
        from make_image import background
        with patch.dict(os.environ,{'OPENAI_API_KEY':'test-secret-value'},clear=False):
            with patch('make_image.json_request',side_effect=HTTPFailure(404,'model unavailable')) as req:
                _,source=background(country('BG'),0,False)
                self.assertEqual(source,'gradient')
                self.assertEqual(req.call_count,2)
                self.assertEqual(req.call_args.kwargs['data']['model'],'gpt-image-1')
            with patch('make_image.json_request',side_effect=HTTPFailure(429,'limit')) as req:
                _,source=background(country('BG'),0,False)
                self.assertEqual(source,'gradient')
                self.assertEqual(req.call_count,1)

    def test_font_coverage(self):
        chars='България Ελλάδα Zażółć gęślą jaźń Österreich Česko România Magyarország Lietuva Latvija Eesti Hrvatska Slovenščina Merħba'
        for bold in (False,True):
            f=font(32,bold); missing=bytes(f.getmask('\u0378'))
            for ch in set(chars.replace(' ','')):
                self.assertNotEqual(bytes(f.getmask(ch)),missing,repr(ch))

    def test_four_no_ai_images(self):
        with tempfile.TemporaryDirectory() as directory:
            for code in ('BG','EL','PL','DE'):
                c=country(code); label=LOCALES[c['language']]
                result=make_image(Path(directory)/(code+'.png'),c,c['language'],label['headline'],c['name_native'],c['url'],no_ai=True)
                self.assertEqual(result['source'],'gradient')
                with Image.open(result['out']) as im: self.assertEqual(im.size,(1536,1024))

    def test_overlay_rejects_clipping(self):
        draw=ImageDraw.Draw(Image.new('RGB',(1536,1024)))
        with self.assertRaises(ValueError): fit(draw,'W'*1000,800,3)

    def test_redaction_and_sql_quoting(self):
        with patch.dict(os.environ,{'FB_PAGE_ACCESS_TOKEN':'very-sensitive-value'}):
            self.assertNotIn('very-sensitive-value',redact('bad very-sensitive-value'))
        self.assertEqual(sql_literal("L'entreprise"),"'L''entreprise'")

    def test_dry_run_performs_no_cloud_writes_or_publish(self):
        store=SQLiteStore(); c=country('BG')
        with (patch.object(store,'snapshot',return_value=fixture()), patch.object(store,'lock',side_effect=AssertionError('write')),
             patch('run_daily.make_image'), patch('run_daily.publish_facebook.publish',side_effect=AssertionError('publish')),
             patch('run_daily.publish_linkedin.publish',side_effect=AssertionError('publish')), patch('builtins.print')):
            args=argparse.Namespace(date='2026-09-20',country=c['code'],dry_run=True,no_ai=False,changes=None,prepare=False)
            self.assertEqual(run(args,store),0)
            self.assertEqual(store.history(),[])
        store.db.close()


if __name__=='__main__': unittest.main()
