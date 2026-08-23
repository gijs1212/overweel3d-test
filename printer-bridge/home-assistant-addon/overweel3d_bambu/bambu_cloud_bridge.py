"""Overweel3D Bambu account bridge (no printer Developer Mode required).

The bridge signs in with a one-time email code, subscribes read-only to the
cloud MQTT report topic for the selected printer and forwards normalized status
to Supabase. The Bambu access token stays on this computer.

Bambu Lab does not publish a supported public consumer Cloud API. This client
uses the same account/cloud endpoints used by Bambu clients and may need an
update when Bambu changes those endpoints.
"""
from __future__ import annotations

import getpass
import hashlib
import json
import re
import secrets
import socket
import ssl
import struct
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

API = "https://api.bambulab.com"
BAMBU_ACCOUNT = "gijsoverweel@gmail.com"
BAMBU_SERIAL = "01P00C590102306"
MQTT_HOST = "us.mqtt.bambulab.com"
TOKEN_FILE = Path("/data/bambu-session.json")
ADDON_OPTIONS_FILE = Path("/data/options.json")
SUPABASE_URL = "https://askbgpdygdiwuocsmsfn.supabase.co"
PRINTER_ID = "4db1c4f5-122f-4dde-8295-185a116ce49e"
BRIDGE_TOKEN = "84999f3072a40acbc11cafd81ebc9c5d24b176393ab830f2"


class BridgeAuthorizationError(RuntimeError):
    """The local bridge token no longer matches the selected website printer."""


def api(path: str, method: str = "GET", payload: dict | None = None, token: str | None = None) -> dict | list:
    headers = {"content-type": "application/json", "user-agent": "Overweel3D-Bambu-Connect/1.0"}
    if token:
        headers["authorization"] = f"Bearer {token}"
    request = urllib.request.Request(
        API + path,
        data=None if payload is None else json.dumps(payload).encode(),
        method=method,
        headers=headers,
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode() or "{}")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")
        raise RuntimeError(f"Bambu-aanvraag mislukt ({exc.code}): {detail[:300]}") from exc


def login() -> dict:
    expired_session: dict = {}
    if TOKEN_FILE.exists():
        saved = json.loads(TOKEN_FILE.read_text(encoding="utf-8"))
        try:
            preference = api("/v1/design-user-service/my/preference", token=saved["access_token"])
            saved["uid"] = str(preference["uid"])
            return saved
        except Exception:
            expired_session = saved
            print("De opgeslagen Bambu-sessie is verlopen; er is een nieuwe e-mailcode nodig.", flush=True)

    account = BAMBU_ACCOUNT
    code = ""
    used_code_hash = str(expired_session.get("email_code_hash") or "")
    if ADDON_OPTIONS_FILE.exists():
        try:
            configured_code = str(json.loads(ADDON_OPTIONS_FILE.read_text(encoding="utf-8")).get("email_code") or "").strip()
        except (OSError, ValueError):
            configured_code = ""
        configured_hash = hashlib.sha256(configured_code.encode()).hexdigest() if configured_code else ""
        if configured_code and configured_hash != used_code_hash:
            code = configured_code

    if not code:
        api("/v1/user-service/user/sendemail/code", "POST", {"email": account, "type": "codeLogin"})
        print(f"Bambu heeft een inlogcode naar {account} gestuurd.", flush=True)
        if ADDON_OPTIONS_FILE.exists():
            print("Vul de ontvangen code in bij de appconfiguratie onder E-mailcode en kies Opslaan.", flush=True)
            while not code:
                time.sleep(2)
                try:
                    configured_code = str(json.loads(ADDON_OPTIONS_FILE.read_text(encoding="utf-8")).get("email_code") or "").strip()
                except (OSError, ValueError):
                    configured_code = ""
                configured_hash = hashlib.sha256(configured_code.encode()).hexdigest() if configured_code else ""
                if configured_code and configured_hash != used_code_hash:
                    code = configured_code
        else:
            code = getpass.getpass("E-mailcode (invoer blijft verborgen): ").strip()

    result = api("/v1/user-service/user/login", "POST", {"account": account, "code": code})
    access_token = str(result.get("accessToken") or "")
    if not access_token:
        raise RuntimeError(f"Bambu-login gaf geen toegangstoken terug: {result}")
    preference = api("/v1/design-user-service/my/preference", token=access_token)
    saved = {
        "account": account,
        "access_token": access_token,
        "uid": str(preference["uid"]),
        "email_code_hash": hashlib.sha256(code.encode()).hexdigest(),
    }
    TOKEN_FILE.write_text(json.dumps(saved), encoding="utf-8")
    try:
        TOKEN_FILE.chmod(0o600)
    except OSError:
        pass
    return saved


def bound_printers(token: str) -> list[dict]:
    result = api("/v1/iot-service/api/user/bind", token=token)
    devices = result.get("devices", result) if isinstance(result, dict) else result
    return devices if isinstance(devices, list) else []


def choose_serial(token: str) -> str:
    return BAMBU_SERIAL


def enc(value: str) -> bytes:
    raw = value.encode()
    return struct.pack("!H", len(raw)) + raw


def remaining_length(value: int) -> bytes:
    result = bytearray()
    while True:
        digit = value % 128
        value //= 128
        if value:
            digit |= 128
        result.append(digit)
        if not value:
            return bytes(result)


def packet(kind: int, payload: bytes) -> bytes:
    return bytes([kind]) + remaining_length(len(payload)) + payload


def connect_packet(username: str, token: str) -> bytes:
    variable = enc("MQTT") + bytes([4, 0xC2]) + struct.pack("!H", 60)
    payload = enc(f"overweel3d-cloud-{secrets.token_hex(6)}") + enc(username) + enc(token)
    return packet(0x10, variable + payload)


def subscribe_packet(topic: str) -> bytes:
    return packet(0x82, struct.pack("!H", 1) + enc(topic) + bytes([0]))


def publish_packet(topic: str, data: dict) -> bytes:
    return packet(0x30, enc(topic) + json.dumps(data, separators=(",", ":")).encode())


def read_packet(sock: ssl.SSLSocket) -> tuple[int, bytes]:
    first = sock.recv(1)
    if not first:
        raise ConnectionError("Bambu Cloud heeft de verbinding gesloten")
    multiplier, length = 1, 0
    while True:
        digit = sock.recv(1)[0]
        length += (digit & 127) * multiplier
        if not digit & 128:
            break
        multiplier *= 128
    payload = bytearray()
    while len(payload) < length:
        chunk = sock.recv(length - len(payload))
        if not chunk:
            raise ConnectionError("Onvolledig MQTT-pakket")
        payload.extend(chunk)
    return first[0], bytes(payload)


def merge(target: dict, patch: dict) -> dict:
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(target.get(key), dict):
            merge(target[key], value)
        else:
            target[key] = value
    return target


def status_payload(report: dict) -> dict:
    state = str(report.get("gcode_state", "IDLE")).upper()
    status = {"RUNNING": "printing", "PAUSE": "paused", "FAILED": "error", "FINISH": "idle", "IDLE": "idle"}.get(state, "idle")
    gcode_file = str(report.get("gcode_file") or "")
    current_file = str(report.get("subtask_name") or gcode_file)
    plate_match = re.search(r"plate[_-]?(\d+)", gcode_file, re.I) or re.search(r"plate[_-]?(\d+)", current_file, re.I)
    slots = []
    for unit_index, unit in enumerate((report.get("ams") or {}).get("ams", []) or []):
        for slot_index, tray in enumerate(unit.get("tray", []) or []):
            raw_color = str(tray.get("tray_color") or "808080").lstrip("#")
            remain = tray.get("remain")
            slots.append({
                "ams_unit": unit_index,
                "slot_number": slot_index + 1,
                "material": tray.get("tray_type"),
                "color_name": tray.get("tray_sub_brands") or tray.get("tray_type"),
                "color_hex": "#" + raw_color[:6],
                "tray_uuid": tray.get("tray_uuid"),
                "remaining_percent": float(remain) if remain not in (None, "") else None,
                "spool_capacity_grams": 1000,
                "raw_status": tray,
            })
    return {
        "status": status,
        "print_state": state,
        "current_file": current_file,
        "current_plate": int(plate_match.group(1)) if plate_match else None,
        "progress": report.get("mc_percent", 0),
        "remaining_minutes": report.get("mc_remaining_time"),
        "current_layer": report.get("layer_num"),
        "total_layers": report.get("total_layer_num"),
        "nozzle_temperature": report.get("nozzle_temper"),
        "bed_temperature": report.get("bed_temper"),
        "chamber_temperature": report.get("chamber_temper"),
        "ams_slots": slots,
        "raw_status": report,
    }


def forward(payload: dict) -> None:
    request = urllib.request.Request(
        SUPABASE_URL + "/functions/v1/printer-status-ingest",
        data=json.dumps(payload).encode(),
        method="POST",
        headers={"content-type": "application/json", "x-printer-id": PRINTER_ID, "x-bridge-token": BRIDGE_TOKEN},
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            if response.status >= 300:
                raise RuntimeError(response.read().decode(errors="replace"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")
        try:
            message = str(json.loads(detail).get("error") or detail)
        except (json.JSONDecodeError, AttributeError):
            message = detail or exc.reason
        if exc.code == 403:
            raise BridgeAuthorizationError(
                "Supabase weigert het bridge-token. Open Admin → Printproductie, klik bij deze "
                "printer op ‘Nieuw bridge-token’, en plak dat nieuwe token hier."
            ) from exc
        raise RuntimeError(f"Status doorsturen mislukt ({exc.code}): {message[:300]}") from exc


def run(session: dict, serial: str) -> None:
    context = ssl.create_default_context()
    with socket.create_connection((MQTT_HOST, 8883), timeout=20) as raw, context.wrap_socket(raw, server_hostname=MQTT_HOST) as sock:
        sock.settimeout(75)
        sock.sendall(connect_packet(f"u_{session['uid']}", session["access_token"]))
        kind, response = read_packet(sock)
        if kind >> 4 != 2 or len(response) < 2 or response[1] != 0:
            raise RuntimeError(f"Bambu Cloud MQTT-login geweigerd: {response.hex()}")
        report_topic, request_topic = f"device/{serial}/report", f"device/{serial}/request"
        sock.sendall(subscribe_packet(report_topic))
        read_packet(sock)
        sock.sendall(publish_packet(request_topic, {"pushing": {"sequence_id": "0", "command": "pushall"}}))
        print(f"Verbonden met Bambu-printer {serial}; live status wordt doorgestuurd.", flush=True)
        complete, last_sent = {}, 0.0
        while True:
            kind, payload = read_packet(sock)
            if kind >> 4 == 3:
                topic_length = struct.unpack("!H", payload[:2])[0]
                data = json.loads(payload[2 + topic_length:].decode(errors="replace"))
                merge(complete, data.get("print") or {})
                if time.time() - last_sent >= 2:
                    forward(status_payload(complete))
                    last_sent = time.time()
            elif kind >> 4 == 13:
                sock.sendall(bytes([0xD0, 0x00]))


def main() -> None:
    global BRIDGE_TOKEN
    unknown_arguments = [argument for argument in sys.argv[1:] if argument != "--login-only"]
    if unknown_arguments:
        raise RuntimeError(f"Onbekende optie(s): {' '.join(unknown_arguments)}")
    session = login()
    if "--login-only" in sys.argv[1:]:
        print(f"Bambu-sessie voor {session['account']} is veilig in het Docker-volume opgeslagen.", flush=True)
        return
    serial = choose_serial(session["access_token"])
    while True:
        try:
            run(session, serial)
        except BridgeAuthorizationError as exc:
            print(f"Cloudbridge-koppeling geweigerd: {exc}", flush=True)
            try:
                replacement = getpass.getpass(
                    "Nieuw OVERWEEL_BRIDGE_TOKEN (Enter om de bridge te stoppen): "
                ).strip()
            except EOFError:
                replacement = ""
            if not replacement:
                raise RuntimeError("Geen nieuw bridge-token ingevoerd; bridge gestopt.") from exc
            BRIDGE_TOKEN = replacement
            print("Nieuw token ontvangen; verbinding wordt opnieuw getest.", flush=True)
        except Exception as exc:
            print(f"Cloudbridge opnieuw verbinden na fout: {exc}", flush=True)
            time.sleep(10)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nBambu-bridge gestopt.", flush=True)
    except Exception as exc:
        print(f"Bambu-bridge kon niet starten: {exc}", flush=True)
        raise SystemExit(1)
