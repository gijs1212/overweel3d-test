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


class BridgeControlTests(unittest.TestCase):
    def test_status_403_never_rotates_permanent_token(self):
        error = urllib.error.HTTPError(
            "https://example.invalid", 403, "Forbidden", {}, io.BytesIO(b'{"error":"invalid"}')
        )
        with patch.object(bridge.urllib.request, "urlopen", side_effect=error), \
                patch.object(bridge, "refresh_bridge_token") as refresh:
            with self.assertRaisesRegex(bridge.BridgeAuthorizationError, "automatische tokenvernieuwing staat uit"):
                bridge.forward({"status": "idle"})
        refresh.assert_not_called()

    def test_control_endpoint_is_not_a_print_queue(self):
        response = MagicMock()
        response.__enter__.return_value.read.return_value = b'{"ok":true}'
        with patch.object(bridge.urllib.request, "urlopen", return_value=response) as urlopen:
            bridge.bridge_control_request({"action": "scan_config"})
        request = urlopen.call_args.args[0]
        self.assertTrue(request.full_url.endswith("/bridge/control"))

    def test_pairing_only_applies_cloud_and_bridge_fields(self):
        bridge.apply_website_pairing({
            "bambu_serial": "SERIAL-1",
            "printer_id": "printer-1",
            "bridge_token": "token",
            "bridge_refresh_token": "refresh",
            "bambu_host": "192.168.2.3",
            "ftps_username": "bblp",
        })
        self.assertEqual(bridge.BAMBU_SERIAL, "SERIAL-1")
        self.assertEqual(bridge.PRINTER_ID, "printer-1")
        self.assertFalse(hasattr(bridge, "BAMBU_HOST"))
        self.assertFalse(hasattr(bridge, "FTPS_USERNAME"))


class AddonPersistenceTests(unittest.TestCase):
    def test_settings_only_persist_retained_options(self):
        settings_file = MagicMock()
        temporary = MagicMock()
        settings_file.with_suffix.return_value = temporary
        with patch.object(bridge, "PERSISTED_OPTIONS_FILE", settings_file), \
                patch.object(bridge, "BAMBU_ACCOUNT", "saved@example.com"), \
                patch.object(bridge, "WEBSITE_PAIRING_CODE", "OW3D-SAVED"), \
                patch.object(bridge, "addon_options", return_value={"email_code": "123456"}):
            bridge.save_persistent_settings()
        saved = json.loads(temporary.write_text.call_args.args[0])
        self.assertEqual(set(saved), {"bambu_account", "email_code", "website_pairing_code"})
        temporary.replace.assert_called_once_with(settings_file)

    def test_configured_email_code_is_used_without_requesting_another(self):
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


class PrinterAndAmsStatusTests(unittest.TestCase):
    def test_ams_only_payload_contains_no_customer_print_fields(self):
        payload = bridge.ams_only_payload({
            "gcode_state": "RUNNING",
            "subtask_name": "private.gcode.3mf",
            "ams": {"ams": [{"tray": [{"tray_type": "PLA", "tray_color": "0A2989"}]}]},
        })
        self.assertTrue(payload["ams_only"])
        self.assertEqual(len(payload["ams_slots"]), 1)
        self.assertNotIn("current_file", payload)
        self.assertNotIn("raw_status", payload)

    def test_ams_roll_weight_is_forwarded_for_admin_inventory(self):
        payload = bridge.status_payload({
            "gcode_state": "IDLE",
            "ams": {"ams": [{"tray": [{
                "tray_type": "PLA", "tray_color": "0A2989", "tray_weight": "750",
                "remain": "80", "tray_uuid": "new-roll",
            }]}]},
        })
        slot = payload["ams_slots"][0]
        self.assertEqual(slot["spool_capacity_grams"], 750)
        self.assertEqual(slot["remaining_percent"], 80)

    def test_nozzle_and_cloud_status_are_normalized(self):
        self.assertEqual(bridge.normalize_nozzle_diameter("0.4 mm"), 0.4)
        self.assertEqual(bridge.cloud_presence_status({"online": True, "print_status": "RUNNING"}), "printing")
        self.assertEqual(bridge.cloud_presence_status({"online": False}), "offline")


class FanAndCatalogTests(unittest.TestCase):
    def test_fan_command_caps_auxiliary_and_chamber_at_thirty_percent(self):
        command = bridge.fan_gcode_command(part_percent=100, auxiliary_percent=90, chamber_percent=90)
        self.assertEqual(command["print"]["param"], "M106 S255\nM106 P2 S77\nM106 P3 S77\n")

    def test_catalog_uses_dutch_name_and_strips_alpha(self):
        colors = bridge.parse_bambu_color_catalog({"data": [{
            "fila_id": "GFA00", "fila_color_code": "10301", "fila_type": "PLA Basic",
            "fila_color_name": {"nl": "Pompoenoranje"}, "fila_color": ["#FF9016FF"],
        }]})
        self.assertEqual(colors[0]["name"], "Pompoenoranje")
        self.assertEqual(colors[0]["color_hex"], "#FF9016")
        self.assertEqual(colors[0]["material"], "PLA")


if __name__ == "__main__":
    unittest.main()
