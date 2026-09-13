"""Windows testprogramma voor Bambu Cloud-printopdrachten.

Maakt altijd een gedateerd logbestand en verstuurt alleen na een expliciete
bevestiging. Tokens en e-mailcodes worden nooit naar het log geschreven.
"""
from __future__ import annotations

import argparse
import json
import os
import socket
import ssl
import struct
import sys
import time
from pathlib import Path

import bambu_cloud_bridge as bridge


class Tee:
    def __init__(self, console, logfile):
        self.console = console
        self.logfile = logfile

    def write(self, value: str) -> int:
        self.console.write(value)
        self.logfile.write(value)
        self.logfile.flush()
        return len(value)

    def flush(self) -> None:
        self.console.flush()
        self.logfile.flush()


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Test en debug een Bambu Cloud-printopdracht.")
    parser.add_argument("--email", required=True, help="Bambu-account e-mailadres")
    parser.add_argument("--serial", required=True, help="Printerserienummer")
    parser.add_argument("--file", required=True, help="Exact SD-kaartpad, bijvoorbeeld model/test.gcode.3mf")
    parser.add_argument("--plate", type=int, default=1, help="Plaatnummer in de 3MF (standaard 1)")
    parser.add_argument("--ams", default="", help="AMS-vakken, komma-gescheiden en nul-gebaseerd, bijvoorbeeld 0,2")
    parser.add_argument("--send", action="store_true", help="Sta toe dat na bevestiging echt een printopdracht wordt verzonden")
    parser.add_argument("--wait", type=int, default=120, help="Aantal seconden op ACK/RUNNING wachten")
    parser.add_argument("--mqtt-host", default="us.mqtt.bambulab.com", help="Bambu Cloud MQTT-host")
    parser.add_argument("--log-dir", default="logs", help="Map waarin het logbestand wordt gemaakt")
    return parser.parse_args()


def parse_ams(value: str) -> list[int]:
    if not value.strip():
        return []
    result = [int(item.strip()) for item in value.split(",")]
    if any(item < 0 or item > 15 for item in result):
        raise ValueError("AMS-vakken moeten tussen 0 en 15 liggen")
    return result


def main() -> int:
    args = arguments()
    log_dir = Path(args.log_dir).expanduser().resolve()
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / f"bambu-cloud-debug-{time.strftime('%Y%m%d-%H%M%S')}.log"
    with log_path.open("w", encoding="utf-8") as logfile:
        original_stdout = sys.stdout
        sys.stdout = Tee(original_stdout, logfile)
        try:
            print("Overweel3D Bambu Cloud debugtool 1.15.3")
            print(f"Logbestand: {log_path}")
            print(f"Account: {args.email}")
            print(f"Printer: {args.serial}")
            print(f"Cloudbroker: {args.mqtt_host}:8883")

            app_data = Path(os.environ.get("LOCALAPPDATA") or Path.home()) / "Overweel3D"
            app_data.mkdir(parents=True, exist_ok=True)
            bridge.TOKEN_FILE = app_data / "bambu-debug-session.json"
            bridge.BAMBU_ACCOUNT = args.email.strip()
            bridge.BAMBU_SERIAL = args.serial.strip()
            bridge.MQTT_HOST = args.mqtt_host.strip()
            session = bridge.login()
            print(f"Bambu Cloud-login geslaagd; user-id={session['uid']} (token is verborgen).")

            mapping = parse_ams(args.ams)
            command = bridge.queue_print_command({
                "file_name": Path(args.file).name,
                "sd_file_path": args.file.replace("\\", "/").lstrip("/"),
                "plate_number": max(1, args.plate),
                "ams_mapping": mapping,
            })
            print("Voorbereide JSON: " + json.dumps(command, ensure_ascii=False, separators=(",", ":")))
            if not args.send:
                print("Alleen controletest: niets verzonden. Voeg --send toe om na bevestiging echt te verzenden.")
                return 0
            confirmation = input("Typ PRINT om deze fysieke printopdracht te verzenden: ").strip()
            if confirmation != "PRINT":
                print("Geannuleerd: er is niets naar de printer gestuurd.")
                return 2

            context = ssl.create_default_context()
            with socket.create_connection((bridge.MQTT_HOST, 8883), timeout=20) as raw:
                with context.wrap_socket(raw, server_hostname=bridge.MQTT_HOST) as cloud:
                    cloud.settimeout(5)
                    cloud.sendall(bridge.connect_packet(f"u_{session['uid']}", session["access_token"]))
                    kind, response = bridge.read_packet(cloud)
                    if kind >> 4 != 2 or len(response) < 2 or response[1] != 0:
                        raise RuntimeError(f"Cloud MQTT-login geweigerd: {response.hex()}")
                    report_topic = f"device/{args.serial}/report"
                    request_topic = f"device/{args.serial}/request"
                    cloud.sendall(bridge.subscribe_packet(report_topic))
                    bridge.read_packet(cloud)
                    print(f"Geabonneerd op {report_topic}")
                    sequence_id = str(command["print"]["sequence_id"])
                    print(f"VERZENDEN naar {request_topic}: " + json.dumps(command, ensure_ascii=False, separators=(",", ":")))
                    cloud.sendall(bridge.publish_packet(request_topic, command))
                    deadline = time.monotonic() + max(10, args.wait)
                    ack_seen = False
                    running_seen = False
                    last_state = ""
                    while time.monotonic() < deadline:
                        try:
                            packet_kind, payload = bridge.read_packet(cloud)
                        except (socket.timeout, TimeoutError, ssl.SSLWantReadError):
                            cloud.sendall(bytes([0xC0, 0x00]))
                            continue
                        if packet_kind >> 4 != 3:
                            continue
                        topic_length = struct.unpack("!H", payload[:2])[0]
                        message = json.loads(payload[2 + topic_length:].decode(errors="replace"))
                        update = message.get("print") or {}
                        if "result" in update:
                            print("ONTVANGEN ACK: " + json.dumps({"print": update}, ensure_ascii=False, separators=(",", ":")))
                            if str(update.get("sequence_id") or "") == sequence_id:
                                ack_seen = True
                                if str(update.get("result") or "").lower() not in {"success", "ok", "0"}:
                                    print(f"RESULTAAT: printer heeft de opdracht afgewezen; reason={update.get('reason')}; print_error={update.get('print_error')}")
                                    return 3
                        state = str(update.get("gcode_state") or "").upper()
                        if state and state != last_state:
                            print(f"STATUS: {last_state or 'ONBEKEND'} -> {state}; volledig bericht=" + json.dumps({"print": update}, ensure_ascii=False, separators=(",", ":")))
                            last_state = state
                        if state == "RUNNING":
                            running_seen = True
                            print(f"RESULTAAT: printer draait. ACK_gevonden={ack_seen}; sequence_id={sequence_id}")
                            return 0
                    print(f"RESULTAAT: timeout. ACK_gevonden={ack_seen}; RUNNING_gevonden={running_seen}; sequence_id={sequence_id}")
                    return 4
        except Exception as exc:
            print(f"FATALE FOUT: {type(exc).__name__}: {exc}")
            return 1
        finally:
            sys.stdout = original_stdout


if __name__ == "__main__":
    raise SystemExit(main())
