import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from editorial import assess, reading_experience, screen


class EditorialTests(unittest.TestCase):
    def story(self, **extra):
        return dict(title='How a small business built its studio practice',
                    excerpt='A case study of 12 decisions shows how an independent business built a practical method for running its studio.',
                    sourceId='s', type='长文', **extra)

    def test_no_bonus_for_language_or_prestige(self):
        a, b = self.story(language='EN'), self.story(language='ZH')
        self.assertEqual(assess(a, {'name':'Famous magazine', 'weight':10})[0], assess(b, {'name':'小博客', 'weight':.1})[0])

    def test_specific_core_interest_qualifies_and_reports_components(self):
        result = assess(self.story(), {})[0]
        self.assertTrue(result['eligible'])
        self.assertEqual(result['version'], 4)
        self.assertEqual(result['lane'], 'core')
        for key in ('relevance', 'novelty', 'specificity', 'usefulness', 'reading', 'negative'):
            self.assertIn(key, result)

    def test_missing_summary_and_generic_science_fail(self):
        self.assertFalse(assess(self.story(excerptBasis='来源定位提示（非正文总结）'), {})[0]['eligible'])
        a = dict(title='Scientists discover a new particle', excerpt='Researchers measured 42 unusual events in a laboratory experiment and published their results.', type='新闻')
        self.assertFalse(assess(a, {})[0]['eligible'])

    def test_negative_topic_can_disqualify_even_when_interest_matches(self):
        a = self.story()
        a['excerpt'] += ' The disease and virus study involves a clinical trial and a NASA spacecraft.'
        result = assess(a, {})[0]
        self.assertGreater(result['negative'], 0)
        self.assertFalse(result['eligible'])

    def test_reading_obstruction_excludes_and_score_stays_stable(self):
        a = self.story(readingExperience={'adDensity':2})
        r = reading_experience(a, {})
        self.assertEqual(r['score'], reading_experience({'readingExperience':r}, {})['score'])
        a['readingExperience']['obstructive'] = True
        self.assertFalse(assess(a, {})[0]['eligible'])

    def test_video_requires_verified_chinese_access(self):
        a = self.story(); a['type'] = '纪录片'
        self.assertFalse(assess(a, {})[0]['eligible'])
        a['viewingAccess'] = {'mode':'zh-Hans','evidenceUrl':'https://example.org/subtitles','verifiedAt':'2026-09-15T00:00:00Z'}
        self.assertTrue(assess(a, {})[0]['eligible'])

    def test_profile_is_maintainable_and_screen_uses_it(self):
        profile = {'version':42, 'core':[{'name':'特定主题','patterns':['small business']}], 'adjacent':[], 'wildcard':[], 'negative':[], 'sourceBias':{}}
        result = screen([self.story()], [], profile)[0]['editorial']
        self.assertEqual(result['profileVersion'], 42)
        self.assertIn('特定主题', result['connections'])


if __name__ == '__main__':
    unittest.main()
