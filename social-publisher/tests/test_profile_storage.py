import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.profile_storage import clear_social_profiles


class BrowserProfileStorageTests(unittest.TestCase):
    def test_clear_removes_only_meta_profile(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as folder:
            data_dir = Path(folder)
            profiles = data_dir / "browser-profiles"
            target = profiles / "meta"
            target.mkdir(parents=True)
            (target / "Cookies").write_text("session", encoding="utf-8")
            untouched = data_dir / "failures" / "keep.png"
            untouched.parent.mkdir(parents=True)
            untouched.write_bytes(b"keep")

            clear_social_profiles(data_dir)

            self.assertFalse((profiles / "meta").exists())
            self.assertTrue(profiles.exists())
            self.assertTrue(untouched.exists())


if __name__ == "__main__":
    unittest.main()
