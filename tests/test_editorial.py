import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from editorial import assess,reading_experience,screen
class EditorialTests(unittest.TestCase):
    def story(self,**extra):
        return dict(title='Do people prefer traditional architecture?',excerpt='Taste is subjective. But when it comes to architecture, there is a surprising level of agreement.',sourceId='s',type='长文',**extra)
    def test_foreign_prestige_gives_no_bonus(self):
        a=self.story(language='EN');b=self.story(language='ZH')
        self.assertEqual(assess(a,{'name':'Famous magazine','weight':10})[0],assess(b,{'name':'小博客','weight':.1})[0])
    def test_chinese_and_english_concrete_stories_both_pass(self):
        a=self.story();b=dict(title='人们为什么喜欢传统建筑？',excerpt='审美通常被视为主观判断，但人们在建筑偏好上却呈现出令人意外的一致性。文章比较不同建筑的设计与人们对城市空间的感受。',type='长文')
        self.assertTrue(assess(a,{})[0]['eligible']);self.assertTrue(assess(b,{})[0]['eligible'])
    def test_missing_summary_and_random_science_fail(self):
        a=self.story(excerptBasis='来源定位提示（非正文总结）');self.assertFalse(assess(a,{})[0]['eligible'])
        b=dict(title='Scientists discover a new particle',excerpt='Researchers measured 42 unusual events in a laboratory experiment and published their results in a scientific journal.',type='新闻');self.assertFalse(assess(b,{})[0]['eligible'])
    def test_ads_are_a_penalty_not_blanket_exclusion(self):
        a=self.story();clear=assess(a,{})[0];a['readingExperience']={'adDensity':3};ad,r=assess(a,{})
        self.assertTrue(ad['eligible']);self.assertLess(ad['score'],clear['score']);self.assertIn('阅读模式',r['hint'])
        a['readingExperience']['obstructive']=True;self.assertFalse(assess(a,{})[0]['eligible'])
    def test_reading_score_does_not_decay_when_rechecked(self):
        a=self.story(readingExperience={'adDensity':2});r=reading_experience(a,{});self.assertEqual(r['score'],reading_experience({'readingExperience':r},{})['score'])
    def test_english_only_video_is_never_eligible(self):
        a=self.story();a['type']='纪录片';self.assertFalse(assess(a,{})[0]['eligible'])
        a['viewingAccess']={'mode':'zh-Hans','evidenceUrl':'https://example.org/subtitles','verifiedAt':'2026-09-15T00:00:00Z'};self.assertTrue(assess(a,{})[0]['eligible'])
    def test_screened_exploration_has_a_bridge(self):
        a=self.story();score=assess(a,{})[0];self.assertTrue(score['exploration']);self.assertTrue(score['connections'])
    def test_word_fragments_and_bacterial_communities_are_not_user_interests(self):
        a=dict(title='Marine bacteria team up',excerpt='Researchers reveal how communities of marine bacteria divide the task of degrading fucoidan, a key player in ocean carbon storage.',type='新闻')
        self.assertFalse(assess(a,{})[0]['eligible'])
        a=dict(title='New training device',excerpt='Researchers studied a training device and reported 42 results from a laboratory with no known practical application.',type='新闻')
        self.assertNotIn('现实中的技术',assess(a,{})[0]['connections'])
