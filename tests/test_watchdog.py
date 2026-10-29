import datetime as dt
import unittest
from scripts.watchdog import UTC, active_run, feed_healthy, target_slot


class WatchdogTest(unittest.TestCase):
    def test_latest_slot_with_grace_and_midnight(self):
        self.assertEqual(target_slot(dt.datetime(2026, 10, 29, 0, 41, tzinfo=UTC)), dt.datetime(2026, 10, 28, 9, 17, tzinfo=UTC))
        self.assertEqual(target_slot(dt.datetime(2026, 10, 29, 0, 42, tzinfo=UTC)), dt.datetime(2026, 10, 29, 0, 17, tzinfo=UTC))
        self.assertEqual(target_slot(dt.datetime(2026, 10, 29, 10, 12, tzinfo=UTC)), dt.datetime(2026, 10, 29, 9, 17, tzinfo=UTC))

    def test_both_timestamps_and_last_good_marker(self):
        slot = dt.datetime(2026, 10, 29, 0, 17, tzinfo=UTC)
        feed = {"checkedAt": "2026-10-29T00:21:00Z", "generatedAt": "2026-10-29T00:20:00Z", "stale": False}
        self.assertTrue(feed_healthy(feed, slot))
        self.assertFalse(feed_healthy({**feed, "generatedAt": "2026-10-28T09:30:00Z"}, slot))
        self.assertFalse(feed_healthy({**feed, "stale": True}, slot))
        self.assertFalse(feed_healthy({**feed, "checkedAt": "invalid"}, slot))

    def test_does_not_dispatch_while_slot_run_is_active(self):
        slot = dt.datetime(2026, 10, 29, 0, 17, tzinfo=UTC)
        runs = [{"id": 1, "created_at": "2026-10-29T00:18:00Z", "status": "in_progress"}]
        self.assertEqual(active_run(runs, slot)["id"], 1)
        self.assertIsNone(active_run([{**runs[0], "status": "completed"}], slot))


if __name__ == '__main__': unittest.main()
