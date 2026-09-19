import importlib.util
import io
import json
import threading
import time
import unittest
import urllib.error
import zipfile
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import MagicMock, patch


MODULE_PATH = Path(__file__).with_name("bambu_cloud_bridge.py")
SPEC = importlib.util.spec_from_file_location("bambu_cloud_bridge", MODULE_PATH)
bridge = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(bridge)


@contextmanager
def isolated_download_cache():
    directory = MODULE_PATH.with_name("_test_download_cache")
    directory.mkdir(exist_ok=True)
    for child in directory.iterdir():
        if child.is_file():
            child.unlink()
    try:
        with patch.object(bridge, "DOWNLOAD_CACHE_DIR", directory):
            yield directory
    finally:
        for child in directory.iterdir():
            if child.is_file():
                child.unlink()
        directory.rmdir()


class ForwardStatusTests(unittest.TestCase):
    def test_403_never_rotates_permanent_bridge_token(self):
        response = io.BytesIO(b'{"error":"Ongeldige bridge-token"}')
        error = urllib.error.HTTPError("https://example.invalid", 403, "Forbidden", {}, response)

        with patch.object(bridge.urllib.request, "urlopen", side_effect=error), \
                patch.object(bridge, "refresh_bridge_token") as refresh:
            with self.assertRaisesRegex(bridge.BridgeAuthorizationError, "automatische tokenvernieuwing staat uit"):
                bridge.forward({"status": "idle"})
        refresh.assert_not_called()

    def test_queue_403_never_rotates_permanent_bridge_token(self):
        forbidden = urllib.error.HTTPError("https://example.invalid", 403, "Forbidden", {}, io.BytesIO(b'{"error":"expired"}'))
        with patch.object(bridge.urllib.request, "urlopen", side_effect=forbidden), \
                patch.object(bridge, "refresh_bridge_token") as refresh:
            with self.assertRaisesRegex(bridge.BridgeAuthorizationError, "automatische tokenvernieuwing staat uit"):
                bridge.queue_request({"action": "poll"})
        refresh.assert_not_called()


class AddonLoginTests(unittest.TestCase):
    def test_empty_runtime_connection_never_erases_saved_ip_or_access_code(self):
        with patch.object(bridge, "BAMBU_HOST", "192.168.2.3"), \
                patch.object(bridge, "BAMBU_ACCESS_CODE", "19159570"), \
                patch.object(bridge, "FTPS_USERNAME", "bblp"), \
                patch.object(bridge, "FTPS_PORT", 990):
            changed = bridge.apply_runtime_ftps_config({"bambu_host": "", "bambu_access_code": ""})
            self.assertFalse(changed)
            self.assertEqual(bridge.BAMBU_HOST, "192.168.2.3")
            self.assertEqual(bridge.BAMBU_ACCESS_CODE, "19159570")

    def test_runtime_connection_is_merged_into_restart_safe_pairing_file(self):
        pairing_file = MagicMock()
        temporary = MagicMock()
        pairing_file.exists.return_value = True
        pairing_file.read_text.return_value = json.dumps({"bridge_token": "stable", "printer_id": "printer-1"})
        pairing_file.with_suffix.return_value = temporary
        with patch.object(bridge, "PAIRING_FILE", pairing_file), \
                patch.object(bridge, "BAMBU_HOST", "192.168.2.3"), \
                patch.object(bridge, "BAMBU_ACCESS_CODE", "19159570"), \
                patch.object(bridge, "FTPS_USERNAME", "bblp"), \
                patch.object(bridge, "FTPS_PORT", 990):
            bridge.persist_runtime_ftps_config()
        saved = json.loads(temporary.write_text.call_args.args[0])
        self.assertEqual(saved["bridge_token"], "stable")
        self.assertEqual(saved["printer_id"], "printer-1")
        self.assertEqual(saved["bambu_host"], "192.168.2.3")
        self.assertEqual(saved["bambu_access_code"], "19159570")
        temporary.replace.assert_called_once_with(pairing_file)

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
    def test_printer_database_status_has_no_automatic_interval(self):
        self.assertFalse(hasattr(bridge, "STATUS_SYNC_INTERVAL_SECONDS"))

    def test_unix_ftps_listing_keeps_complete_print_filename(self):
        entry = bridge.parse_ftp_directory_line(
            "-rw-r--r-- 1 bblp bblp 17009330 Sep 17 20:10 boekenleggers.gcode.3mf"
        )
        self.assertEqual(entry, {
            "name": "boekenleggers.gcode.3mf",
            "type": "file",
            "size_bytes": 17009330,
        })

    def test_dos_ftps_listing_recognizes_files_and_directories(self):
        file_entry = bridge.parse_ftp_directory_line("09-17-2026  08:10PM  17009330 boekenleggers.gcode.3mf")
        directory_entry = bridge.parse_ftp_directory_line("09-17-2026  08:10PM  <DIR> Mijn prints")
        self.assertEqual(file_entry["name"], "boekenleggers.gcode.3mf")
        self.assertEqual(file_entry["size_bytes"], 17009330)
        self.assertEqual(directory_entry["type"], "directory")
        self.assertEqual(directory_entry["name"], "Mijn prints")

    def test_mlsd_listing_is_preferred_and_preserves_spaces(self):
        ftp = MagicMock()
        ftp.pwd.return_value = "/"
        ftp.mlsd.return_value = iter([
            ("boeken leggers.gcode.3mf", {"type": "file", "size": "17009330"}),
            ("submap", {"type": "dir"}),
        ])
        entries = bridge.ftp_directory_entries(ftp, "/cache")
        self.assertEqual(entries[0]["name"], "boeken leggers.gcode.3mf")
        self.assertEqual(entries[0]["size_bytes"], 17009330)
        self.assertEqual(entries[1]["type"], "directory")
        ftp.dir.assert_not_called()

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

    def test_project_3mf_detects_every_populated_plate_json(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("Metadata/plate_1.json", json.dumps({"bbox_objects": [{"name": "A"}]}))
            archive.writestr("Metadata/plate_2.json", json.dumps({"bbox_objects": []}))
            archive.writestr("Metadata/plate_4.json", json.dumps({"bbox_objects": [{"name": "B"}]}))
            archive.writestr("Metadata/plate_1.png", b"preview")
        plates, _ = bridge.parse_3mf_metadata(buffer.getvalue())
        self.assertEqual([plate["number"] for plate in plates], [1, 4])
        self.assertFalse(plates[0]["printable"])
        self.assertIn("preview_data_url", plates[0])

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
        bridge.HOST_STARTED_BY_ADDON_FOR.clear()
        bridge.HOST_SHUTDOWN_PENDING_FOR.clear()
        bridge.HOST_POWER_OFF_COMPLETED_FOR.clear()

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

    def test_dry_run_marker_is_forwarded_explicitly_to_vm(self):
        with patch.object(bridge, "ping_host", return_value=True), \
                patch.object(bridge, "guest_is_ready", return_value=True), \
                patch.object(bridge, "publish_host_pc_status"), \
                patch.object(bridge.time, "sleep"):
            bridge.dispatch_to_vm_guest({
                "id": "queue-test", "file_name": "test.3mf", "plate_number": 2,
                "bridge_error": "DRY_RUN_PENDING",
            })
        pending = bridge.pending_guest_snapshot()
        self.assertTrue(pending["payload"]["job"]["dry_run"])
        self.assertTrue(bridge.queue_item_is_dry_run(pending["payload"]["job"]))

    def test_offline_pc_is_started_once_then_waits_two_and_half_minutes(self):
        with patch.object(bridge, "ping_host", side_effect=[False, False, True]), \
                patch.object(bridge, "guest_is_ready", return_value=True), \
                patch.object(bridge, "publish_host_pc_status"), \
                patch.object(bridge, "call_home_assistant_entity") as call_entity, \
                patch.object(bridge.time, "sleep") as sleep:
            bridge.dispatch_to_vm_guest({"id": "queue-2", "file_name": "test.3mf", "plate_number": 1})
        call_entity.assert_called_once_with(bridge.PC_POWER_ON_ENTITY)
        self.assertEqual([call.args[0] for call in sleep.call_args_list], [5, bridge.HOST_BOOT_DELAY_SECONDS])
        self.assertIn("queue-2", bridge.HOST_STARTED_BY_ADDON_FOR)

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

    def test_manual_refresh_checks_host_and_vm_without_operating_power(self):
        with patch.object(bridge, "ping_host", side_effect=[True, False]) as ping, \
                patch.object(bridge, "guest_is_ready", return_value=False), \
                patch.object(bridge, "publish_host_pc_status") as publish_host, \
                patch.object(bridge, "publish_vm_status") as publish_vm, \
                patch.object(bridge, "call_home_assistant_entity") as call_entity:
            result = bridge.refresh_machine_reachability()
        self.assertEqual(result, (True, False))
        self.assertEqual([call.args[0] for call in ping.call_args_list], [bridge.HOST_PC_IP, bridge.VM_IP])
        publish_host.assert_called_once_with(True)
        publish_vm.assert_called_once_with(False)
        call_entity.assert_not_called()

    def test_vm_display_status_never_operates_or_starts_a_print(self):
        with patch.object(bridge, "ping_host", side_effect=[True, KeyboardInterrupt]) as ping, \
                patch.object(bridge, "publish_vm_status") as publish, \
                patch.object(bridge, "call_home_assistant_entity") as call_entity, \
                patch.object(bridge, "queue_print_command") as queue_print, \
                patch.object(bridge.time, "sleep"):
            with self.assertRaises(KeyboardInterrupt):
                bridge.vm_status_loop()
        publish.assert_called_once_with(True)
        ping.assert_any_call(bridge.VM_IP)
        call_entity.assert_not_called()
        queue_print.assert_not_called()

    def test_recent_vm_agent_heartbeat_reports_vm_online_without_icmp(self):
        with patch.object(bridge, "guest_is_ready", side_effect=[True, KeyboardInterrupt]), \
                patch.object(bridge, "ping_host") as ping, \
                patch.object(bridge, "publish_vm_status") as publish, \
                patch.object(bridge.time, "sleep"):
            with self.assertRaises(KeyboardInterrupt):
                bridge.vm_status_loop()
        publish.assert_called_once_with(True)
        ping.assert_not_called()

    def test_home_assistant_button_uses_press_service(self):
        response = MagicMock()
        response.__enter__.return_value.status = 200
        with patch.object(bridge, "SUPERVISOR_TOKEN", "test"), \
                patch.object(bridge.urllib.request, "urlopen", return_value=response) as open_request:
            bridge.call_home_assistant_entity("button.pc_gijs_overweel3d")
        request = open_request.call_args.args[0]
        self.assertTrue(request.full_url.endswith("/api/services/button/press"))
        self.assertEqual(json.loads(request.data), {"entity_id": "button.pc_gijs_overweel3d"})

    def test_confirmed_print_stops_vm_but_keeps_preexisting_host_on(self):
        with patch.object(bridge, "call_home_assistant_entity") as call_entity, \
                patch.object(bridge.time, "sleep") as sleep:
            bridge.stop_vm_then_host("queue-4")
            bridge.stop_vm_then_host("queue-4")
        call_entity.assert_called_once_with(bridge.VM_START_ENTITY)
        sleep.assert_not_called()
        self.assertFalse(bridge.handle_vm_stopped_callback({"event": "vm_stopped"}))

    def test_confirmed_vm_stop_powers_off_only_host_started_by_addon(self):
        bridge.HOST_STARTED_BY_ADDON_FOR.add("queue-owned")
        with patch.object(bridge, "call_home_assistant_entity") as call_entity:
            bridge.stop_vm_then_host("queue-owned")
        call_entity.assert_called_once_with(bridge.VM_START_ENTITY)
        self.assertIn("queue-owned", bridge.HOST_SHUTDOWN_PENDING_FOR)

        class ImmediateThread:
            def __init__(self, target, **_kwargs):
                self.target = target

            def start(self):
                self.target()

        with patch.object(bridge.threading, "Thread", ImmediateThread), \
                patch.object(bridge, "call_home_assistant_entity") as power_off, \
                patch.object(bridge.time, "sleep") as sleep:
            self.assertTrue(bridge.handle_vm_stopped_callback({"event": "vm_stopped"}))
            self.assertFalse(bridge.handle_vm_stopped_callback({"event": "vm_stopped"}))
        sleep.assert_called_once_with(5)
        power_off.assert_called_once_with(bridge.PC_POWER_OFF_ENTITY)

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

    def test_guest_api_accepts_private_vm_or_nat_addresses_only(self):
        with patch.object(bridge, "VM_IP", "192.168.2.42"):
            self.assertTrue(bridge.guest_client_allowed("192.168.2.42"))
            self.assertTrue(bridge.guest_client_allowed("192.168.2.20"))
            self.assertTrue(bridge.guest_client_allowed("172.30.32.1"))
            self.assertFalse(bridge.guest_client_allowed("8.8.8.8"))

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

    def test_runtime_ftps_settings_can_be_changed_and_cleared(self):
        with patch.object(bridge, "BAMBU_HOST", "192.168.2.3"), \
                patch.object(bridge, "BAMBU_ACCESS_CODE", "old"), \
                patch.object(bridge, "FTPS_USERNAME", "bblp"), \
                patch.object(bridge, "FTPS_PORT", 990):
            changed = bridge.apply_runtime_ftps_config({
                "bambu_host": "192.168.2.4",
                "bambu_access_code": "new",
                "ftps_username": "operator",
                "ftps_port": 1990,
            })
            self.assertTrue(changed)
            self.assertEqual((bridge.BAMBU_HOST, bridge.BAMBU_ACCESS_CODE, bridge.FTPS_USERNAME, bridge.FTPS_PORT), ("192.168.2.4", "new", "operator", 1990))
            bridge.apply_runtime_ftps_config({"bambu_host": "", "bambu_access_code": "", "connection_found": True})
            self.assertEqual((bridge.BAMBU_HOST, bridge.BAMBU_ACCESS_CODE), ("", ""))

    def test_successful_sd_scan_does_not_reference_metadata_download_locals(self):
        ftp = MagicMock()
        entries = [{"name": "voorbeeld.gcode.3mf", "type": "file", "size_bytes": 1024}]
        with patch.object(bridge, "BAMBU_HOST", "192.168.2.3"), \
                patch.object(bridge, "BAMBU_ACCESS_CODE", "19159570"), \
                patch.object(bridge, "ImplicitFTP_TLS", return_value=ftp), \
                patch.object(bridge, "ftp_directory_entries", return_value=entries):
            files, listing = bridge.list_sd_files(["/cache"])
        self.assertEqual(files[0]["display_name"], "voorbeeld.gcode.3mf")
        self.assertEqual(listing[0]["size_bytes"], 1024)
        ftp.connect.assert_called_once_with("192.168.2.3", bridge.FTPS_PORT)
        ftp.login.assert_called_once_with(bridge.FTPS_USERNAME, "19159570")

    def test_sd_scan_recognizes_boekenleggers_gcode_3mf(self):
        ftp = MagicMock()
        entries = [{"name": "boekenleggers.gcode.3mf", "type": "file", "size_bytes": 17009330}]
        with patch.object(bridge, "BAMBU_HOST", "192.168.2.3"), \
                patch.object(bridge, "BAMBU_ACCESS_CODE", "19159570"), \
                patch.object(bridge, "ImplicitFTP_TLS", return_value=ftp), \
                patch.object(bridge, "ftp_directory_entries", return_value=entries):
            files, _ = bridge.list_sd_files(["/cache"])
        self.assertEqual(len(files), 1)
        self.assertEqual(files[0]["display_name"], "boekenleggers.gcode.3mf")

    def test_standalone_gcode_without_plate_suffix_is_not_silently_dropped(self):
        ftp = MagicMock()
        entries = [{"name": "boekenlegger.gcode", "type": "file", "size_bytes": 1234}]
        with patch.object(bridge, "BAMBU_HOST", "192.168.2.3"), \
                patch.object(bridge, "BAMBU_ACCESS_CODE", "19159570"), \
                patch.object(bridge, "ImplicitFTP_TLS", return_value=ftp), \
                patch.object(bridge, "ftp_directory_entries", return_value=entries):
            files, _ = bridge.list_sd_files(["/cache"])
        self.assertEqual(files[0]["display_name"], "boekenlegger.gcode")
        self.assertEqual(files[0]["plates"][0]["path"], "cache/boekenlegger.gcode")

    def test_gcode_group_metadata_targets_include_every_plate(self):
        targets = bridge.metadata_download_targets({
            "path": "gcode-group:abc",
            "metadata_requested_plate_number": 2,
            "plates": [
                {"number": 2, "name": "Achterkant", "path": "cache/model_plate_2.gcode", "size_bytes": 20},
                {"number": 1, "name": "Voorkant", "path": "cache/model_plate_1.gcode", "size_bytes": 10},
            ],
        })
        self.assertEqual([target["plate_number"] for target in targets], [1, 2])
        self.assertEqual([target["path"] for target in targets], ["cache/model_plate_1.gcode", "cache/model_plate_2.gcode"])

    def test_group_parse_downloads_all_files_before_saving_plates_and_colors(self):
        ftp = MagicMock()
        cached_path = MagicMock()
        cached_path.is_file.return_value = True
        cached_path.name = "cached.gcode"
        cached_path.stat.return_value.st_size = 20
        cached_path.stat.return_value.st_mtime = time.time()
        request = {
            "id": "file-1", "path": "gcode-group:abc", "display_name": "Model",
            "metadata_request_id": 4,
            "plates": [
                {"number": 1, "name": "Voorkant", "path": "cache/model_plate_1.gcode", "size_bytes": 10},
                {"number": 2, "name": "Achterkant", "path": "cache/model_plate_2.gcode", "size_bytes": 20},
            ],
        }
        def parse_file(_ftp, path, _size, plate_number, plate_name, _cancelled, progress):
            progress(10 if plate_number == 1 else 20, _size)
            filament = {"material": "PLA", "color_hex": "#FFFFFF" if plate_number == 1 else "#000000"}
            return ([{"number": plate_number, "name": plate_name, "detected_filaments": [filament]}], [filament])
        with patch.object(bridge, "ImplicitFTP_TLS", return_value=ftp), \
                patch.object(bridge, "read_remote_print_metadata", side_effect=parse_file) as read_metadata, \
                patch.object(bridge, "download_cache_path", return_value=cached_path), \
                patch.object(bridge, "queue_request", return_value={"success": True}) as queue:
            bridge.sync_requested_file_metadata(request)
        self.assertEqual(read_metadata.call_count, 2)
        completed = [call.args[0] for call in queue.call_args_list if call.args[0].get("action") == "sync_file_metadata"][-1]
        self.assertEqual([plate["number"] for plate in completed["plates"]], [1, 2])
        self.assertEqual(len(completed["detected_filaments"]), 2)
        self.assertEqual(completed["downloaded_bytes"], 30)
        self.assertEqual(completed["total_bytes"], 30)
        self.assertGreater(completed["cache_expires_at"], int(time.time()))
        self.assertEqual(len(completed["cached_files"]), 2)

    def test_metadata_completion_requires_a_real_cached_file(self):
        ftp = MagicMock()
        request = {
            "id": "file-1", "path": "cache/model.gcode.3mf", "display_name": "Model",
            "metadata_request_id": 5, "size_bytes": 10,
        }
        missing_cache = MagicMock()
        missing_cache.is_file.return_value = False
        with patch.object(bridge, "ImplicitFTP_TLS", return_value=ftp), \
                patch.object(bridge, "read_remote_print_metadata", return_value=([{"number": 1}], [])), \
                patch.object(bridge, "download_cache_path", return_value=missing_cache), \
                patch.object(bridge, "queue_request", return_value={"success": True}) as queue:
            bridge.sync_requested_file_metadata(request)
        completion = [call.args[0] for call in queue.call_args_list if call.args[0].get("action") == "sync_file_metadata"][-1]
        self.assertIn("ontbreekt in de 48-uurscache", completion["error"])

    def test_scan_without_local_credentials_is_reported_instead_of_silently_ignored(self):
        with patch.object(bridge, "BAMBU_HOST", ""), patch.object(bridge, "BAMBU_ACCESS_CODE", ""):
            with self.assertRaisesRegex(RuntimeError, "printer-IP of lokale toegangscode ontbreekt"):
                bridge.sync_sd_files(["/cache"], 12)
            with self.assertRaisesRegex(RuntimeError, "printer-IP of lokale toegangscode ontbreekt"):
                bridge.sync_sd_directories(13)

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

    def test_remote_download_can_be_cancelled_and_partial_cache_is_removed(self):
        ftp = MagicMock()
        def transfer(_command, callback, blocksize):
            self.assertEqual(blocksize, 256 * 1024)
            callback(b"partial download")
        ftp.retrbinary.side_effect = transfer
        with isolated_download_cache() as directory:
            with self.assertRaisesRegex(bridge.MetadataDownloadCancelled, "geannuleerd"):
                bridge.read_remote_print_metadata(ftp, "/cache/test.gcode.3mf", None, cancellation_check=lambda: True)
            self.assertEqual(list(directory.iterdir()), [])

    def test_remote_download_reports_received_bytes_and_total(self):
        ftp = MagicMock()
        ftp.retrbinary.side_effect = lambda _command, callback, blocksize: callback(b"1234567890")
        progress = MagicMock(return_value=False)
        with isolated_download_cache(), patch.object(bridge, "parse_3mf_metadata", return_value=([], [])):
            bridge.read_remote_print_metadata(ftp, "/cache/test.gcode.3mf", 10, cancellation_check=lambda: False, progress_callback=progress)
        progress.assert_any_call(10, 10)

    def test_completed_download_is_reused_from_48_hour_cache(self):
        ftp = MagicMock()
        ftp.retrbinary.side_effect = lambda _command, callback, blocksize: callback(b"cached")
        with isolated_download_cache(), patch.object(bridge, "parse_3mf_metadata", return_value=([{"number": 1}], [])):
            first = bridge.read_remote_print_metadata(ftp, "/cache/model.gcode.3mf", 6)
            second = bridge.read_remote_print_metadata(ftp, "/cache/model.gcode.3mf", 6)
        self.assertEqual(first, second)
        self.assertEqual(ftp.retrbinary.call_count, 1)

    def test_cache_cleanup_removes_only_files_older_than_two_days(self):
        with isolated_download_cache() as directory:
            old = directory / "old.3mf"
            recent = directory / "recent.3mf"
            old.write_bytes(b"old")
            recent.write_bytes(b"recent")
            old_time = 1_000.0
            bridge.os.utime(old, (old_time, old_time))
            bridge.os.utime(recent, (200_000.0, 200_000.0))
            removed = bridge.cleanup_download_cache(now=old_time + bridge.DOWNLOAD_CACHE_TTL_SECONDS + 1)
            self.assertEqual(removed, 1)
            self.assertFalse(old.exists())
            self.assertTrue(recent.exists())

    def test_metadata_worker_does_not_start_same_request_twice(self):
        request = {"id": "file-1", "metadata_request_id": 7}
        gate = threading.Event()
        def work(_request):
            gate.wait(1)
        with patch.object(bridge, "sync_requested_file_metadata", side_effect=work):
            self.assertTrue(bridge.start_requested_file_metadata(request))
            self.assertFalse(bridge.start_requested_file_metadata(request))
            gate.set()
            for _ in range(100):
                with bridge.METADATA_LOCK:
                    if not bridge.METADATA_ACTIVE:
                        break
                time.sleep(0.001)
        self.assertFalse(bridge.METADATA_ACTIVE)

if __name__ == "__main__":
    unittest.main()
