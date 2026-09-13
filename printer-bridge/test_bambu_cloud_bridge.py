import importlib.util
import io
import json
import unittest
import urllib.error
import zipfile
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
            with self.assertRaisesRegex(bridge.BridgeAuthorizationError, "herstel-token"):
                bridge.forward({"status": "idle"})

    def test_403_refreshes_and_retries_with_rotated_token(self):
        forbidden = urllib.error.HTTPError("https://example.invalid", 403, "Forbidden", {}, io.BytesIO(b'{"error":"expired"}'))
        success = MagicMock()
        success.__enter__.return_value.status = 200
        with patch.object(bridge.urllib.request, "urlopen", side_effect=[forbidden, success]), \
                patch.object(bridge, "refresh_bridge_token", return_value="new-token") as refresh, \
                patch.object(bridge, "BRIDGE_TOKEN", "old-token"):
            def rotate(rejected_token):
                bridge.BRIDGE_TOKEN = "new-token"
                return "new-token"
            refresh.side_effect = rotate
            bridge.forward({"status": "idle"})
        refresh.assert_called_once_with("old-token")


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

    def test_settings_fall_back_to_persistent_config_after_reinstall(self):
        with patch.dict(bridge.os.environ, {}, clear=True), \
                patch.object(bridge, "OPTIONS", {}), \
                patch.object(bridge, "PERSISTED_OPTIONS", {"bambu_account": "saved@example.com"}):
            self.assertEqual(bridge.setting("BAMBU_ACCOUNT"), "saved@example.com")

    def test_runtime_settings_are_written_atomically(self):
        settings_file = MagicMock()
        temporary = MagicMock()
        settings_file.with_suffix.return_value = temporary
        with patch.object(bridge, "PERSISTED_OPTIONS_FILE", settings_file), \
                patch.object(bridge, "BAMBU_ACCOUNT", "saved@example.com"), \
                patch.object(bridge, "WEBSITE_PAIRING_CODE", "OW3D-SAVED-CODE"), \
                patch.object(bridge, "NEXT_PLATE_BUTTON_ENTITY", "input_button.next"), \
                patch.object(bridge, "addon_options", return_value={"email_code": "123456"}):
            bridge.save_persistent_settings()
        saved = json.loads(temporary.write_text.call_args.args[0])
        self.assertEqual(saved["bambu_account"], "saved@example.com")
        self.assertEqual(saved["email_code"], "123456")
        self.assertEqual(saved["website_pairing_code"], "OW3D-SAVED-CODE")
        temporary.replace.assert_called_once_with(settings_file)

    def test_legacy_session_is_migrated_without_overwriting_existing_config(self):
        source = MagicMock()
        destination = MagicMock()
        source.is_file.return_value = True
        destination.exists.return_value = False
        with patch.object(bridge.shutil, "copy2") as copy:
            self.assertTrue(bridge.migrate_persistent_file(source, destination))
        destination.parent.mkdir.assert_called_once_with(parents=True, exist_ok=True)
        copy.assert_called_once_with(source, destination)

        destination.exists.return_value = True
        with patch.object(bridge.shutil, "copy2") as copy:
            self.assertFalse(bridge.migrate_persistent_file(source, destination))
        copy.assert_not_called()


class FilamentStatusTests(unittest.TestCase):
    def test_ams_payload_uses_the_roll_weight_reported_by_bambu(self):
        payload = bridge.status_payload({
            "gcode_state": "IDLE",
            "ams": {"ams": [{"tray": [{
                "tray_type": "PLA",
                "tray_color": "0A2989",
                "tray_weight": "750",
                "remain": "80",
                "tray_uuid": "new-roll",
            }]}]},
        })

        self.assertEqual(payload["ams_slots"][0]["spool_capacity_grams"], 750)
        self.assertEqual(payload["ams_slots"][0]["remaining_percent"], 80)

    def test_missing_roll_weight_falls_back_to_one_kilo(self):
        self.assertEqual(bridge.spool_capacity_grams({}), 1000)


class PrinterQueueTests(unittest.TestCase):
    def test_cloud_presence_maps_online_printer_without_mqtt_report(self):
        self.assertEqual(bridge.cloud_presence_status({"online": True, "print_status": "IDLE"}), "idle")
        self.assertEqual(bridge.cloud_presence_status({"online": True, "print_status": "RUNNING"}), "printing")
        self.assertEqual(bridge.cloud_presence_status({"online": False, "print_status": "IDLE"}), "offline")

    def test_raw_gcode_metadata_reads_only_used_filaments(self):
        plates, filaments = bridge.parse_gcode_metadata(b"""; filament_colour = #FFFFFF;#0056B8;#00AE42\n; filament_type = PLA;PLA;PETG\n; filament: 1,3\n; total filament weight [g] : 28.59,70.81\n""", 4, "Logo")
        self.assertEqual(plates[0]["number"], 4)
        self.assertEqual(plates[0]["name"], "Logo")
        self.assertEqual([item["color_hex"] for item in filaments], ["#FFFFFF", "#00AE42"])
        self.assertEqual([item["material"] for item in filaments], ["PLA", "PETG"])

    def test_multiplate_3mf_detects_every_embedded_plate(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("Metadata/plate_1.gcode", "; plate 1")
            archive.writestr("Metadata/plate_4.gcode", "; plate 4")
        plates, _ = bridge.parse_3mf_metadata(buffer.getvalue())
        self.assertEqual([plate["number"] for plate in plates], [1, 4])

    def test_input_button_only_fires_when_press_timestamp_changes(self):
        button = bridge.InputButtonPress()
        self.assertFalse(button.update("2026-09-09T10:00:00+00:00"))
        self.assertFalse(button.update("2026-09-09T10:00:00+00:00"))
        self.assertTrue(button.update("2026-09-09T10:01:00+00:00"))
        self.assertFalse(button.update("unavailable"))

    def test_queue_command_disables_every_calibration_by_default(self):
        command = bridge.queue_print_command({
            "id": "job", "file_name": "voorbeeld.3mf", "sd_file_path": "cache/voorbeeld.3mf",
            "plate_number": 4, "ams_mapping": [0, 2],
        })["print"]
        self.assertEqual(command["param"], "Metadata/plate_4.gcode")
        self.assertEqual(command["url"], "file:///sdcard/cache/voorbeeld.3mf")
        self.assertEqual(command["ams_mapping"], [0, 2])
        self.assertEqual(command["ams_mapping2"], [{"ams_id": 0, "slot_id": 0}, {"ams_id": 0, "slot_id": 2}])
        self.assertEqual(command["plate_idx"], 3)
        self.assertFalse(command["bed_leveling"])
        self.assertFalse(command["bed_levelling"])
        self.assertFalse(command["flow_cali"])
        self.assertFalse(command["vibration_cali"])

    def test_queue_command_enables_only_requested_bed_leveling(self):
        command = bridge.queue_print_command({
            "id": "job", "file_name": "voorbeeld.3mf", "sd_file_path": "cache/voorbeeld.3mf",
            "plate_number": 1, "ams_mapping": [0], "calibration_enabled": True,
        })["print"]
        self.assertTrue(command["bed_leveling"])
        self.assertTrue(command["bed_levelling"])
        self.assertEqual(command["auto_bed_leveling"], 1)
        self.assertFalse(command["flow_cali"])
        self.assertFalse(command["vibration_cali"])

    def test_raw_gcode_uses_absolute_sd_card_path(self):
        command = bridge.queue_print_command({
            "file_name": "plaat.gcode", "sd_file_path": "cache/plaat.gcode",
            "plate_number": 1, "ams_mapping": [],
        })["print"]
        self.assertEqual(command["command"], "gcode_file")
        self.assertEqual(command["param"], "/sdcard/cache/plaat.gcode")

    def test_pairing_code_hash_ignores_formatting_and_case(self):
        self.assertEqual(
            bridge.pairing_code_hash("OW3D-ABCD-EFGH-JKLM"),
            bridge.pairing_code_hash("ow3d abcd efgh jklm"),
        )

    def tearDown(self):
        bridge.GUEST_PENDING_JOB = None
        bridge.GUEST_LAST_SEEN = 0
        bridge.GUEST_LAST_EVENT = None
        bridge.POWER_OFF_REQUESTED_FOR.clear()

    def test_online_pc_waits_one_minute_and_does_not_toggle_ready_vm(self):
        with patch.object(bridge, "ping_host", return_value=True), \
                patch.object(bridge, "guest_is_ready", return_value=True), \
                patch.object(bridge, "publish_host_pc_status") as publish, \
                patch.object(bridge, "call_home_assistant_entity") as call_entity, \
                patch.object(bridge.time, "sleep") as sleep:
            result = bridge.dispatch_to_vm_guest({"id": "queue-1", "file_name": "test.3mf", "plate_number": 1})
        self.assertTrue(result["accepted"])
        publish.assert_called_once_with(True)
        sleep.assert_called_once_with(bridge.HOST_ONLINE_DELAY_SECONDS)
        call_entity.assert_not_called()

    def test_offline_pc_is_started_once_then_waits_two_and_half_minutes(self):
        with patch.object(bridge, "ping_host", side_effect=[False, False, True]), \
                patch.object(bridge, "guest_is_ready", return_value=True), \
                patch.object(bridge, "publish_host_pc_status"), \
                patch.object(bridge, "call_home_assistant_entity") as call_entity, \
                patch.object(bridge.time, "sleep") as sleep:
            bridge.dispatch_to_vm_guest({"id": "queue-2", "file_name": "test.3mf", "plate_number": 1})
        call_entity.assert_called_once_with(bridge.PC_POWER_ON_ENTITY)
        self.assertEqual([call.args[0] for call in sleep.call_args_list], [5, bridge.HOST_BOOT_DELAY_SECONDS])

    def test_missing_vm_signal_toggles_vm_once(self):
        readiness = iter([False, True])
        with patch.object(bridge, "ping_host", return_value=True), \
                patch.object(bridge, "guest_is_ready", side_effect=lambda: next(readiness)), \
                patch.object(bridge, "publish_host_pc_status"), \
                patch.object(bridge, "call_home_assistant_entity") as call_entity, \
                patch.object(bridge.time, "sleep"):
            bridge.GUEST_LAST_SEEN = bridge.time.monotonic()
            bridge.dispatch_to_vm_guest({"id": "queue-3", "file_name": "test.3mf", "plate_number": 1})
        call_entity.assert_called_once_with(bridge.VM_START_ENTITY)

    def test_minute_status_ping_never_operates_power(self):
        with patch.object(bridge, "ping_host", side_effect=[True, KeyboardInterrupt]), \
                patch.object(bridge, "publish_host_pc_status") as publish, \
                patch.object(bridge, "call_home_assistant_entity") as call_entity, \
                patch.object(bridge.time, "sleep"):
            with self.assertRaises(KeyboardInterrupt):
                bridge.host_status_loop()
        publish.assert_called_once_with(True)
        call_entity.assert_not_called()

    def test_home_assistant_button_uses_press_service(self):
        response = MagicMock()
        response.__enter__.return_value.status = 200
        with patch.object(bridge, "SUPERVISOR_TOKEN", "test"), \
                patch.object(bridge.urllib.request, "urlopen", return_value=response) as open_request:
            bridge.call_home_assistant_entity("button.pc_gijs_overweel3d")
        request = open_request.call_args.args[0]
        self.assertTrue(request.full_url.endswith("/api/services/button/press"))
        self.assertEqual(json.loads(request.data), {"entity_id": "button.pc_gijs_overweel3d"})

    def test_confirmed_print_stops_vm_then_pc_once(self):
        with patch.object(bridge, "call_home_assistant_entity") as call_entity, \
                patch.object(bridge.time, "sleep") as sleep:
            bridge.stop_vm_then_host("queue-4")
            bridge.stop_vm_then_host("queue-4")
        self.assertEqual([call.args[0] for call in call_entity.call_args_list], [
            bridge.VM_START_ENTITY, bridge.PC_POWER_OFF_ENTITY,
        ])
        sleep.assert_called_once_with(30)

    def test_guest_failure_event_is_consumed_only_by_matching_job(self):
        bridge.GUEST_LAST_EVENT = {"event": "guest_failed", "job_id": "job-1", "error": "test"}
        self.assertIsNone(bridge.take_guest_event("job-2"))
        self.assertEqual(bridge.take_guest_event("job-1")["error"], "test")
        self.assertIsNone(bridge.take_guest_event("job-1"))

    def test_pending_guest_snapshot_survives_cloud_reconnect(self):
        bridge.GUEST_PENDING_JOB = {
            "runner_job_id": "job-7",
            "dispatched_at": 123.0,
            "payload": {"job": {"id": "queue-7"}},
        }
        snapshot = bridge.pending_guest_snapshot()
        self.assertEqual(snapshot["runner_job_id"], "job-7")
        self.assertEqual(snapshot["payload"]["job"]["id"], "queue-7")

    def test_guest_api_only_accepts_configured_vm_ip(self):
        with patch.object(bridge, "VM_IP", "192.168.2.42"):
            self.assertTrue(bridge.guest_client_allowed("192.168.2.42"))
            self.assertFalse(bridge.guest_client_allowed("192.168.2.30"))

    def test_selected_print_requires_matching_name_and_plate(self):
        item = {"file_name": "photowall.gcode.3mf", "sd_file_path": "cache/photowall.gcode.3mf", "plate_number": 1}
        self.assertTrue(bridge.selected_print_matches(item, {"subtask_name": "photowall.gcode.3mf", "gcode_file": "Metadata/plate_1.gcode"}))
        self.assertFalse(bridge.selected_print_matches(item, {"subtask_name": "ander.gcode.3mf", "gcode_file": "Metadata/plate_1.gcode"}))
        self.assertFalse(bridge.selected_print_matches(item, {"subtask_name": "photowall.gcode.3mf", "gcode_file": "Metadata/plate_2.gcode"}))
        self.assertFalse(bridge.selected_print_matches(item, {"subtask_name": "photowall.gcode.3mf", "gcode_file": ""}))
        self.assertTrue(bridge.selected_print_matches(item, {"subtask_name": "photowall.gcode.3mf", "plate_idx": 0}))


class FtpsConnectionTests(unittest.TestCase):
    def test_tls_context_does_not_require_client_certificate(self):
        context = MagicMock()
        with patch.object(bridge.ssl, "_create_unverified_context", return_value=context):
            self.assertIs(bridge.printer_tls_context(), context)
        context.load_cert_chain.assert_not_called()

    def test_pairing_applies_configurable_ftps_credentials(self):
        bridge.apply_website_pairing({"ftps_username": "operator", "ftps_port": 1990})
        self.assertEqual(bridge.FTPS_USERNAME, "operator")
        self.assertEqual(bridge.FTPS_PORT, 1990)

    def test_filament_is_inferred_without_downloading_3mf(self):
        self.assertEqual(bridge.infer_filament_from_name("cadeau_PLA_Blauw_plate_2.gcode"), ("PLA", "Blauw"))
        self.assertEqual(bridge.infer_filament_from_name("onderdeel_PETG_zwart.3mf"), ("PETG", "Zwart"))

    def test_multiple_colors_are_inferred_for_one_plate(self):
        self.assertEqual(bridge.infer_filaments_from_name("logo_PLA_zwart_wit_rood_plate_3.gcode"), [
            {"material": "PLA", "color_name": "Zwart"},
            {"material": "PLA", "color_name": "Wit"},
            {"material": "PLA", "color_name": "Rood"},
        ])

    def test_3mf_slicer_metadata_returns_real_materials_and_hex_colors(self):
        content = bridge.io.BytesIO()
        with bridge.zipfile.ZipFile(content, "w") as archive:
            archive.writestr("Metadata/project_settings.config", json.dumps({
                "filament_colour": ["#0A2989", "#FFFFFF"],
                "filament_type": ["PLA", "PETG"],
            }))
            archive.writestr("Metadata/plate_2.gcode", "; test")
        plates, filaments = bridge.parse_3mf_metadata(content.getvalue())
        self.assertEqual(plates[0]["number"], 2)
        self.assertEqual(plates[0]["name"], "Plaat 2")
        self.assertEqual(len(plates[0]["detected_filaments"]), 2)
        self.assertEqual([item["color_hex"] for item in filaments], ["#0A2989", "#FFFFFF"])
        self.assertEqual([item["material"] for item in filaments], ["PLA", "PETG"])

if __name__ == "__main__":
    unittest.main()
