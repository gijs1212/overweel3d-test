import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("CONTROL_PASSWORD", "test-dashboard-password")
os.environ.setdefault("DATA_DIR", tempfile.mkdtemp(prefix="overweel-social-test-"))

from app.policy import profile_name_from_url
from app.publishers import combined_account_label_matches, instagram_profile_matches, is_instagram_settings_page, meta_session_is_authenticated


class AccountCheckTests(unittest.TestCase):
    def test_meta_home_account_switcher_matches_the_linked_instagram_handle(self):
        expected = "https://www.instagram.com/overweel3d/"
        self.assertTrue(combined_account_label_matches("Overweel3D, overweel3d", expected))
        self.assertTrue(combined_account_label_matches("Overweel3D · @overweel3d", expected))
        self.assertFalse(combined_account_label_matches("Overweel3D, another_account", expected))

    def test_instagram_profile_must_match_the_configured_account(self):
        expected = "https://www.instagram.com/overweel3d/"
        self.assertTrue(instagram_profile_matches("https://www.instagram.com/Overweel3D/?hl=nl", expected))
        self.assertFalse(instagram_profile_matches("https://www.instagram.com/another_account/", expected))
        self.assertFalse(instagram_profile_matches("https://business.facebook.com/instagram/overweel3d", expected))

    def test_only_business_suite_instagram_settings_count_as_account_evidence(self):
        self.assertTrue(is_instagram_settings_page("https://business.facebook.com/latest/settings/instagram_accounts"))
        self.assertTrue(is_instagram_settings_page("https://business.facebook.com/latest/settings/instagram_account/"))
        self.assertFalse(is_instagram_settings_page("https://business.facebook.com/latest/home"))
        self.assertFalse(is_instagram_settings_page("https://www.instagram.com/overweel3d/"))

    def test_business_suite_login_does_not_require_composer(self):
        self.assertTrue(meta_session_is_authenticated(
            "https://business.facebook.com/latest/home", {"c_user"}, False, False,
        ))

    def test_business_suite_shell_can_confirm_session_without_cookie_access(self):
        self.assertTrue(meta_session_is_authenticated(
            "https://business.facebook.com/home", set(), False, True,
        ))

    def test_login_form_or_checkpoint_never_confirms_session(self):
        self.assertFalse(meta_session_is_authenticated(
            "https://business.facebook.com/latest/home", {"c_user"}, True, True,
        ))
        self.assertFalse(meta_session_is_authenticated(
            "https://business.facebook.com/checkpoint/", {"c_user"}, False, True,
        ))

    def test_cookie_on_unrelated_page_does_not_confirm_business_suite(self):
        self.assertFalse(meta_session_is_authenticated(
            "https://www.facebook.com/login", {"c_user"}, False, False,
        ))

    def test_profile_name_comes_from_public_url(self):
        self.assertEqual(profile_name_from_url("https://www.instagram.com/overweel3d/", "Instagram"), "overweel3d")

    def test_profile_name_uses_fallback_for_invalid_url(self):
        self.assertEqual(profile_name_from_url("", "Instagram"), "Instagram")


if __name__ == "__main__":
    unittest.main()
