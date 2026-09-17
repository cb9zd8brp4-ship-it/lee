import sys,unittest,datetime as dt
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import feed_pipeline as p
class PipelineTests(unittest.TestCase):
    def test_tracking_and_download_query(self):
        self.assertEqual(p.canonical('https://example.org/book.epub?source=feed&utm_source=rss'),'https://example.org/book.epub?source=feed')
        self.assertIsNone(p.canonical('javascript:alert(1)'))
        self.assertIsNone(p.canonical('https://localhost/private'))
    def test_type_specific_retention_windows(self):
        now=dt.datetime(2026,9,13,tzinfo=p.UTC)
        self.assertEqual(p.retention_days('新闻'),14);self.assertEqual(p.retention_days('数据'),45);self.assertEqual(p.retention_days('长文'),180)
        xml=b'''<rss><channel>
        <item><title>Recent long article</title><link>https://example.org/article/1</link><pubDate>Sat, 01 Aug 2026 00:00:00 GMT</pubDate><description>A public description.</description></item>
        <item><title>Very old long article</title><link>https://example.org/article/2</link><pubDate>Mon, 01 Dec 2025 00:00:00 GMT</pubDate><description>Old description.</description></item>
        <item><title>Premium-only report</title><link>https://example.org/article/3</link><pubDate>Sat, 12 Sep 2026 00:00:00 GMT</pubDate></item>
        </channel></rss>'''
        source=dict(id='example',name='Example',url='https://example.org',type='长文',language='EN',category='科技与未来',tier='core',desc='desc')
        stats={'raw':0,'timeRejected':0};items=p.parse_feed(xml,source,now,stats)
        self.assertEqual([i['title'] for i in items],['Recent long article']);self.assertEqual(stats['raw'],3);self.assertEqual(stats['timeRejected'],1)
    def test_deduplication(self):
        self.assertEqual(len(p.dedupe([dict(id='a',url='https://example.org/a?utm_source=x',title='An example long title about an interesting thing'),dict(id='b',url='https://example.org/a',title='Same')])),1)
    def test_candidate_plan_puts_unseen_articles_first_and_caps_inventory(self):
        def article(i):return dict(id=i,url=f'https://example.org/{i}',title=f'Article {i}',sourceId='s'+str(int(i[1:])%5),publishedAt='2026-09-16T00:00:00Z',type='长文')
        old=[article('a'+str(i)) for i in range(20)];new=[article('n'+str(i)) for i in range(100)]
        selected,new_ids=p.candidate_plan(old+new,{'items':old},80)
        self.assertEqual(len(selected),80);self.assertTrue(set(new_ids));self.assertTrue(all(i in {x['id'] for x in selected} for i in new_ids))
        self.assertTrue(all(x['id'].startswith('n') for x in selected[:10]))
    def test_article_rejects_private_redirect(self):
        class Response:
            def __init__(self,*a,**k):
                import io
                self.stdout=io.BytesIO(b'HTTP/2 302\r\nlocation: https://localhost/private\r\n\r\n')
            def poll(self):return 0
            def wait(self,**k):return 0
        with patch.object(p,'public_url',return_value=True),patch.object(p.subprocess,'Popen',Response):
            item,error=p.check_article({'url':'https://example.org/a'},dt.datetime.now(p.UTC));self.assertIsNone(item);self.assertIn('重定向',error)
    def test_article_404_and_paywall_are_rejected(self):
        import io
        for body in [b'HTTP/2 404\r\ncontent-type: text/html\r\n\r\n<html>gone</html>',b'HTTP/2 200\r\ncontent-type: text/html\r\n\r\n<html>"isAccessibleForFree":false</html>']:
            class Response:
                def __init__(self,*a,**k):self.stdout=io.BytesIO(body)
                def poll(self):return 0
                def wait(self,**k):return 0
            with patch.object(p,'public_url',return_value=True),patch.object(p.subprocess,'Popen',Response):
                item,error=p.check_article({'url':'https://example.org/a'},dt.datetime.now(p.UTC));self.assertIsNone(item);self.assertTrue(error)
if __name__=='__main__':unittest.main()
