import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.policy import media_limit, retry_delay_seconds


class PublisherPolicyTests(unittest.TestCase):
    def test_platform_media_limits(self):
        self.assertEqual(media_limit("facebook"), 10)
        self.assertEqual(media_limit("instagram"), 10)

    def test_retry_schedule_stops_after_three_attempts(self):
        self.assertEqual([retry_delay_seconds(i) for i in range(3)], [60, 300, 900])
        self.assertIsNone(retry_delay_seconds(3))


if __name__ == "__main__":
    unittest.main()
