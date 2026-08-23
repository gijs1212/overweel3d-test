import importlib.util
import io
import json
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import MagicMock, patch


MODULE_PATH = Path(__file__).with_name("bambu_cloud_bridge.py")
SPEC = importlib.util.spec_from_file_location("bambu_cloud_bridge", MODULE_PATH)
bridge = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(bridge)


class ForwardStatusTests(unittest.TestCase):
    def test_403_requests_a_new_bridge_token(self):
        response = io.BytesIO(b'{"error":"Ongeldige bridge-token"}')
        error = urllib.error.HTTPError("https://example.invalid", 403, "Forbidden", {}, response)

        with patch.object(bridge.urllib.request, "urlopen", side_effect=error):
            with self.assertRaisesRegex(bridge.BridgeAuthorizationError, "Nieuw bridge-token"):
                bridge.forward({"status": "idle"})


class AddonLoginTests(unittest.TestCase):
    def test_configured_addon_code_logs_in_without_requesting_another_code(self):
        options_file = MagicMock()
        options_file.exists.return_value = True
        options_file.read_text.return_value = json.dumps({"email_code": "123456"})
        token_file = MagicMock()
        token_file.exists.return_value = False

        def fake_api(path, method="GET", payload=None, token=None):
            if path.endswith("/login"):
                self.assertEqual(payload, {"account": bridge.BAMBU_ACCOUNT, "code": "123456"})
                return {"accessToken": "bambu-token"}
            if path.endswith("/preference"):
                return {"uid": "42"}
            self.fail(f"Onverwachte API-aanvraag: {path}")

        with patch.object(bridge, "ADDON_OPTIONS_FILE", options_file), \
                patch.object(bridge, "TOKEN_FILE", token_file), \
                patch.object(bridge, "api", side_effect=fake_api):
            session = bridge.login()

        self.assertEqual(session["access_token"], "bambu-token")
        token_file.write_text.assert_called_once()


if __name__ == "__main__":
    unittest.main()
