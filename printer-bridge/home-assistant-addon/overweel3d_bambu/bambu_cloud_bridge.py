"""Overweel3D Bambu account bridge (no printer Developer Mode required).

The bridge signs in with a one-time email code, subscribes read-only to the
cloud MQTT report topic for the selected printer and forwards normalized status
to Appwrite. The Bambu access token stays on this computer.

Bambu Lab does not publish a supported public consumer Cloud API. This client
uses the same account/cloud endpoints used by Bambu clients and may need an
update when Bambu changes those endpoints.
"""
from __future__ import annotations

import base64
import getpass
import ftplib
import hashlib
import json
import os
import re
import secrets
import shutil
import socket
import ssl
import struct
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

CONFIG_DIR = Path("/config/overweel3d")
LEGACY_DATA_DIR = Path("/data")
TOKEN_FILE = CONFIG_DIR / "bambu-session.json"
BRIDGE_TOKEN_FILE = CONFIG_DIR / "overweel-bridge-token.json"
PAIRING_FILE = CONFIG_DIR / "website-pairing.json"
PERSISTED_OPTIONS_FILE = CONFIG_DIR / "settings.json"
ADDON_OPTIONS_FILE = Path("/data/options.json")


def addon_options() -> dict:
    if not ADDON_OPTIONS_FILE.exists():
        return {}
    try:
        value = json.loads(ADDON_OPTIONS_FILE.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


OPTIONS = addon_options()


def persisted_options() -> dict:
    if not PERSISTED_OPTIONS_FILE.exists():
        return {}
    try:
        value = json.loads(PERSISTED_OPTIONS_FILE.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


PERSISTED_OPTIONS = persisted_options()


def setting(name: str, default: str = "") -> str:
    return str(os.environ.get(name) or OPTIONS.get(name.lower()) or PERSISTED_OPTIONS.get(name.lower()) or default).strip()


API = "https://api.bambulab.com"
BAMBU_ACCOUNT = setting("BAMBU_ACCOUNT", "gijsoverweel@gmail.com")
WEBSITE_PAIRING_CODE = setting("WEBSITE_PAIRING_CODE")
CLOUD_PRESENCE_INTERVAL_SECONDS = 120
FAN_STATUS_CHECK_SECONDS = 30
FAN_VENTILATION_INTERVAL_SECONDS = 5 * 60
FAN_VENTILATION_DURATION_SECONDS = 60
BAMBU_COLOR_CATALOG_INTERVAL_SECONDS = 60 * 60
BAMBU_COLOR_CATALOG_URL = "https://raw.githubusercontent.com/bambulab/BambuStudio/master/resources/profiles/BBL/filament/filaments_color_codes.json"
MQTT_HOST = "us.mqtt.bambulab.com"
WEBSITE_API_URL = setting("WEBSITE_API_URL", "https://appwrite.gijsoverweel.nl/v1/functions/overweel3d-api/executions")
if "/api/overweel3d" in WEBSITE_API_URL:
    WEBSITE_API_URL = "https://appwrite.gijsoverweel.nl/v1/functions/overweel3d-api/executions"
APPWRITE_PROJECT_ID = setting("APPWRITE_PROJECT_ID", "6af9acde00152998cadb")
BAMBU_SERIAL = ""
PRINTER_ID = ""
BRIDGE_TOKEN = ""
BRIDGE_REFRESH_TOKEN = ""
INSTALLED_NOZZLE_DIAMETER: float | None = None

BRIDGE_TOKEN_LOCK = threading.Lock()
PRINT_SEQUENCE_LOCK = threading.Lock()
PRINT_SEQUENCE_ID = secrets.randbelow(9000) + 1000
LATEST_REPORT_LOCK = threading.Lock()
LATEST_PRINTER_REPORT: dict = {}
AMS_REFRESH_REQUESTED = threading.Event()
AMS_REFRESH_COMPLETED = threading.Event()


class BridgeAuthorizationError(RuntimeError):
    """The local bridge token no longer matches the selected website printer."""


def website_execution(kind: str, name: str, body: dict, timeout: int = 20) -> dict:
    request = urllib.request.Request(
        WEBSITE_API_URL,
        data=json.dumps({
            "body": json.dumps({"kind": kind, "name": name, "body": body}),
            "async": False,
            "path": "/",
            "method": "POST",
            "headers": json.dumps({"content-type": "application/json"}),
        }).encode(),
        method="POST",
        headers={"content-type": "application/json", "x-appwrite-project": APPWRITE_PROJECT_ID},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        execution = json.loads(response.read().decode() or "{}")
    payload = json.loads(execution.get("responseBody") or "{}")
    status = int(execution.get("responseStatusCode") or 500)
    if status == 403:
        raise BridgeAuthorizationError(str(payload.get("error") or "Ongeldige blijvende bridge-token."))
    if execution.get("status") != "completed" or status >= 300 or payload.get("error"):
        raise RuntimeError(str(payload.get("error") or execution.get("errors") or "Appwrite Function is mislukt."))
    return payload.get("data") or {}


def migrate_persistent_file(source: Path, destination: Path) -> bool:
    if not source.is_file() or destination.exists():
        return False
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    if os.name != "nt":
        try:
            destination.chmod(0o600)
        except OSError:
            pass
    return True


def initialize_persistent_storage() -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    if os.name != "nt":
        for directory in (CONFIG_DIR,):
            try:
                directory.chmod(0o700)
            except OSError:
                pass

    migrations = (
        (LEGACY_DATA_DIR / "bambu-session.json", TOKEN_FILE),
        (LEGACY_DATA_DIR / "overweel-bridge-token.json", BRIDGE_TOKEN_FILE),
        (LEGACY_DATA_DIR / "website-pairing.json", PAIRING_FILE),
    )
    for source, destination in migrations:
        migrate_persistent_file(source, destination)


def save_persistent_settings() -> None:
    latest_options = addon_options()
    def latest(name: str, fallback: str = "") -> str:
        return str(os.environ.get(name.upper()) or latest_options.get(name) or PERSISTED_OPTIONS.get(name) or fallback).strip()

    values = {
        "bambu_account": latest("bambu_account", BAMBU_ACCOUNT),
        "email_code": latest("email_code"),
        "website_pairing_code": latest("website_pairing_code", WEBSITE_PAIRING_CODE),
    }
    temporary = PERSISTED_OPTIONS_FILE.with_suffix(".tmp")
    temporary.write_text(json.dumps(values), encoding="utf-8")
    temporary.replace(PERSISTED_OPTIONS_FILE)
    if os.name != "nt":
        try:
            PERSISTED_OPTIONS_FILE.chmod(0o600)
        except OSError:
            pass


def pairing_code_hash(code: str) -> str:
    canonical = re.sub(r"[^A-Z0-9]", "", str(code or "").upper())
    return hashlib.sha256(canonical.encode()).hexdigest()


def apply_website_pairing(config: dict) -> None:
    global BAMBU_SERIAL, PRINTER_ID, BRIDGE_TOKEN, BRIDGE_REFRESH_TOKEN
    BAMBU_SERIAL = str(config.get("bambu_serial") or "").strip()
    PRINTER_ID = str(config.get("printer_id") or "").strip()
    BRIDGE_TOKEN = str(config.get("bridge_token") or "").strip()
    BRIDGE_REFRESH_TOKEN = str(config.get("bridge_refresh_token") or "").strip()


def local_sd_access_available() -> bool:
    """Cloud mode can coexist with read-only local FTPS using the access code."""
    return bool(BAMBU_HOST and BAMBU_ACCESS_CODE)


def apply_runtime_ftps_config(config: dict) -> bool:
    """Apply website-managed FTPS settings without rotating bridge credentials."""
    global BAMBU_HOST, BAMBU_ACCESS_CODE, FTPS_USERNAME, FTPS_PORT
    previous = (BAMBU_HOST, BAMBU_ACCESS_CODE, FTPS_USERNAME, FTPS_PORT)
    incoming_host = str(config.get("bambu_host") or "").strip()
    incoming_access_code = str(config.get("bambu_access_code") or "").strip()
    connection_confirmed = config.get("connection_found") is True
    if incoming_host or connection_confirmed:
        BAMBU_HOST = incoming_host
    if incoming_access_code or connection_confirmed:
        BAMBU_ACCESS_CODE = incoming_access_code
    FTPS_USERNAME = str(config.get("ftps_username") or FTPS_USERNAME or "bblp").strip()
    try:
        FTPS_PORT = int(config.get("ftps_port") or FTPS_PORT or 990)
    except (TypeError, ValueError):
        FTPS_PORT = 990
    return previous != (BAMBU_HOST, BAMBU_ACCESS_CODE, FTPS_USERNAME, FTPS_PORT)


def persist_runtime_ftps_config() -> None:
    """Merge live website FTPS settings into the restart-safe pairing file."""
    try:
        saved = json.loads(PAIRING_FILE.read_text(encoding="utf-8")) if PAIRING_FILE.exists() else {}
        saved.update({
            "bambu_host": BAMBU_HOST,
            "bambu_access_code": BAMBU_ACCESS_CODE,
            "ftps_username": FTPS_USERNAME,
            "ftps_port": FTPS_PORT,
        })
        temporary = PAIRING_FILE.with_suffix(".tmp")
        temporary.write_text(json.dumps(saved), encoding="utf-8")
        temporary.replace(PAIRING_FILE)
        try:
            PAIRING_FILE.chmod(0o600)
        except OSError:
            pass
    except (OSError, ValueError) as exc:
        print(f"FTPS-instellingen konden niet blijvend worden opgeslagen: {exc}", flush=True)


def printer_tls_context() -> ssl.SSLContext:
    # The printer uses a device-local certificate. Authentication is performed
    # with bblp + access code; no proprietary Bambu client certificate is needed.
    context = ssl._create_unverified_context()
    return context


def exchange_website_pairing() -> None:
    if not WEBSITE_PAIRING_CODE:
        raise RuntimeError("Vul de website-koppelcode uit Admin → Printproductie in.")
    expected_hash = pairing_code_hash(WEBSITE_PAIRING_CODE)
    if PAIRING_FILE.exists():
        try:
            saved = json.loads(PAIRING_FILE.read_text(encoding="utf-8"))
            if saved.get("pairing_code_hash") == expected_hash and saved.get("token_mode") == "permanent":
                apply_website_pairing(saved)
                if all((BAMBU_SERIAL, PRINTER_ID, BRIDGE_TOKEN, BRIDGE_REFRESH_TOKEN)):
                    return
        except (OSError, ValueError):
            pass

    try:
        config = website_execution("function", "printer-pair", {"action": "exchange", "code": WEBSITE_PAIRING_CODE})
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")
        try:
            message = str(json.loads(detail).get("error") or detail)
        except (json.JSONDecodeError, AttributeError):
            message = detail or exc.reason
        raise RuntimeError(f"Website-koppelcode geweigerd ({exc.code}): {message[:300]}") from exc
    config["pairing_code_hash"] = expected_hash
    apply_website_pairing(config)
    if not all((BAMBU_SERIAL, PRINTER_ID, BRIDGE_TOKEN, BRIDGE_REFRESH_TOKEN)):
        raise RuntimeError("De website gaf onvolledige printerkoppelgegevens terug.")
    PAIRING_FILE.write_text(json.dumps(config), encoding="utf-8")
    try:
        PAIRING_FILE.chmod(0o600)
    except OSError:
        pass
    # The permanent website pairing code is also the stable bridge credential.
    # Persist it once; it is deliberately never rotated automatically.
    save_bridge_token(BRIDGE_TOKEN)
    print("Website-koppelcode geaccepteerd; printergegevens zijn intern opgeslagen.", flush=True)


def load_saved_bridge_token() -> None:
    global BRIDGE_TOKEN
    if not BRIDGE_TOKEN_FILE.exists():
        return
    try:
        saved = json.loads(BRIDGE_TOKEN_FILE.read_text(encoding="utf-8"))
        if saved.get("printer_id") == PRINTER_ID and saved.get("access_token"):
            BRIDGE_TOKEN = str(saved["access_token"])
    except (OSError, ValueError):
        pass


def save_bridge_token(token: str) -> None:
    BRIDGE_TOKEN_FILE.write_text(json.dumps({"printer_id": PRINTER_ID, "access_token": token}), encoding="utf-8")
    try:
        BRIDGE_TOKEN_FILE.chmod(0o600)
    except OSError:
        pass


def refresh_bridge_token(rejected_token: str = "") -> str:
    raise BridgeAuthorizationError(
        "Appwrite weigert de blijvende bridge-token. Automatische tokenvernieuwing staat uit; "
        "controleer de website-koppelcode in de add-oninstellingen."
    )


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


def normalize_nozzle_diameter(value) -> float | None:
    """Return a plausible nozzle diameter in millimetres from Bambu/slicer data."""
    if isinstance(value, dict):
        for key in ("installed_nozzle_diameter", "nozzle_diameter", "diameter", "value"):
            normalized = normalize_nozzle_diameter(value.get(key))
            if normalized is not None:
                return normalized
        return None
    if isinstance(value, (list, tuple)):
        for item in value:
            normalized = normalize_nozzle_diameter(item)
            if normalized is not None:
                return normalized
        return None
    if value in (None, ""):
        return None
    match = re.search(r"(?<!\d)(0(?:[.,]\d+)|1(?:[.,]0)?)(?!\d)", str(value))
    if not match:
        return None
    try:
        diameter = float(match.group(1).replace(",", "."))
    except ValueError:
        return None
    return round(diameter, 3) if 0.1 <= diameter <= 1.2 else None


def report_nozzle_diameter(report: dict | None) -> float | None:
    if isinstance(report, dict):
        for key in ("installed_nozzle_diameter", "nozzle_diameter", "nozzle_diameter_mm", "machine_nozzle_size"):
            normalized = normalize_nozzle_diameter(report.get(key))
            if normalized is not None:
                return normalized
        normalized = normalize_nozzle_diameter(report.get("nozzle"))
        if normalized is not None:
            return normalized
    return INSTALLED_NOZZLE_DIAMETER


def cloud_presence_status(device: dict) -> str:
    if device.get("online") is False:
        return "offline"
    state = str(device.get("print_status") or device.get("gcode_state") or "IDLE").upper()
    return {
        "RUNNING": "printing",
        "PRINTING": "printing",
        "PAUSE": "paused",
        "PAUSED": "paused",
        "FAILED": "error",
        "ERROR": "error",
    }.get(state, "idle")


def cloud_presence_loop(token: str, serial: str) -> None:
    """Keep website presence fresh even while Cloud MQTT reconnects."""
    global INSTALLED_NOZZLE_DIAMETER
    while True:
        try:
            devices = bound_printers(token)
            device = next((item for item in devices if str(item.get("dev_id") or "") == serial), None)
            if not device:
                raise RuntimeError(f"Printer {serial} ontbreekt in het gekoppelde Bambu-account")
            reported_nozzle = report_nozzle_diameter(device)
            if reported_nozzle is not None:
                INSTALLED_NOZZLE_DIAMETER = reported_nozzle
            status = cloud_presence_status(device)
            forward({
                "status": status,
                "heartbeat_only": True,
                "installed_nozzle_diameter": INSTALLED_NOZZLE_DIAMETER,
            })
            nozzle_text = f"; nozzle {INSTALLED_NOZZLE_DIAMETER:g} mm" if INSTALLED_NOZZLE_DIAMETER is not None else ""
            print(f"Bambu Cloud-aanwezigheid bevestigd: {status}{nozzle_text}.", flush=True)
        except Exception as exc:
            print(f"Bambu Cloud-aanwezigheidscontrole tijdelijk mislukt: {exc}", flush=True)
        time.sleep(CLOUD_PRESENCE_INTERVAL_SECONDS)


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


def next_print_sequence_id() -> str:
    global PRINT_SEQUENCE_ID
    with PRINT_SEQUENCE_LOCK:
        PRINT_SEQUENCE_ID = 1000 if PRINT_SEQUENCE_ID >= 9999 else PRINT_SEQUENCE_ID + 1
        return str(PRINT_SEQUENCE_ID)


def fan_gcode_command(*, part_percent: int | None = None, auxiliary_percent: int | None = None, chamber_percent: int | None = None) -> dict:
    """Build a safe Bambu command: unnumbered part fan, P2 auxiliary, P3 chamber."""
    lines: list[str] = []
    for command, percent, maximum in (("M106", part_percent, 100), ("M106 P2", auxiliary_percent, 30), ("M106 P3", chamber_percent, 30)):
        if percent is None:
            continue
        bounded = max(0, min(maximum, int(percent)))
        pwm = (255 * bounded + 50) // 100
        lines.append(f"{command} S{pwm}")
    if not lines:
        raise ValueError("Minimaal één ventilatorsnelheid is vereist")
    return {"print": {
        "sequence_id": next_print_sequence_id(),
        "command": "gcode_line",
        "param": "\n".join(lines) + "\n",
    }}


def reported_fan_percent(report: dict | None, field: str) -> float | None:
    """Normalize Bambu's reported 0-15 fan steps (or a percentage) to 0-100%."""
    if not isinstance(report, dict) or report.get(field) in (None, ""):
        return None
    try:
        value = max(0.0, float(report[field]))
    except (TypeError, ValueError):
        return None
    if value <= 15:
        return value * 100 / 15
    if value <= 100:
        return value
    return min(100.0, value * 100 / 255)


def fan_has_manual_override(report: dict | None, field: str) -> bool:
    """Treat any observed auxiliary/chamber speed except 0% or 30% as manual."""
    percent = reported_fan_percent(report, field)
    if percent is None:
        return False
    return not (percent <= 2 or abs(percent - 30) <= 5)


class PrintFanAutomation:
    """Thirty-second print check with a one-minute enclosure ventilation pulse."""

    def __init__(self) -> None:
        self.last_check_at: float | None = None
        self.was_printing = False
        self.next_ventilation_at: float | None = None
        self.ventilation_until: float | None = None
        self.auxiliary_expected: int | None = None
        self.chamber_expected: int | None = None
        self.auxiliary_manual_detection_armed = False
        self.chamber_manual_detection_armed = False
        self.auxiliary_override = False
        self.chamber_override = False

    def _update_manual_overrides(self, report: dict | None) -> None:
        for prefix, field in (("auxiliary", "big_fan1_speed"), ("chamber", "big_fan2_speed")):
            observed = reported_fan_percent(report, field)
            if observed is None:
                continue
            allowed = observed <= 2 or abs(observed - 30) <= 5
            armed_name = f"{prefix}_manual_detection_armed"
            override_name = f"{prefix}_override"
            expected = getattr(self, f"{prefix}_expected")
            if allowed and expected is not None:
                setattr(self, armed_name, True)
                setattr(self, override_name, False)
            elif getattr(self, armed_name):
                setattr(self, override_name, True)

    def _command(self, *, part: int | None = None, auxiliary: int | None = None, chamber: int | None = None) -> dict:
        if auxiliary is not None:
            self.auxiliary_expected = auxiliary
        if chamber is not None:
            self.chamber_expected = chamber
        return fan_gcode_command(part_percent=part, auxiliary_percent=auxiliary, chamber_percent=chamber)

    def tick(self, now: float, state: str, report: dict | None = None) -> tuple[bool, dict | None]:
        if self.last_check_at is not None and now - self.last_check_at < FAN_STATUS_CHECK_SECONDS:
            return False, None
        self.last_check_at = now
        self._update_manual_overrides(report)
        auxiliary_off = None if self.auxiliary_override else 0
        chamber_off = None if self.chamber_override else 0
        auxiliary_pulse = None if self.auxiliary_override else 30
        chamber_pulse = None if self.chamber_override else 30
        printing = str(state or "").upper() == "RUNNING"
        if not printing:
            if not self.was_printing:
                return True, None
            self.was_printing = False
            self.next_ventilation_at = None
            self.ventilation_until = None
            return True, self._command(part=0, auxiliary=auxiliary_off, chamber=chamber_off)

        if not self.was_printing:
            self.was_printing = True
            self.next_ventilation_at = now + FAN_VENTILATION_INTERVAL_SECONDS
            self.ventilation_until = None
            # Reset P2/P3 after a reconnect, then keep P1 at 100%.
            return True, self._command(part=100, auxiliary=auxiliary_off, chamber=chamber_off)

        if self.ventilation_until is not None and now >= self.ventilation_until:
            self.ventilation_until = None
            return True, self._command(part=100, auxiliary=auxiliary_off, chamber=chamber_off)

        if self.ventilation_until is None and self.next_ventilation_at is not None and now >= self.next_ventilation_at:
            self.ventilation_until = now + FAN_VENTILATION_DURATION_SECONDS
            self.next_ventilation_at = now + FAN_VENTILATION_INTERVAL_SECONDS
            return True, self._command(part=100, auxiliary=auxiliary_pulse, chamber=chamber_pulse)

        return True, self._command(part=100)


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


def spool_capacity_grams(tray: dict) -> float:
    """Read Bambu's nominal roll weight, with a safe 1 kg fallback."""
    for key in ("tray_weight", "spool_capacity_grams", "weight"):
        try:
            value = float(tray.get(key))
        except (TypeError, ValueError):
            continue
        if value > 0:
            return value * 1000 if value < 10 else value
    return 1000


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
                "spool_capacity_grams": spool_capacity_grams(tray),
                "raw_status": tray,
            })
    raw_status = json.loads(json.dumps(report))
    installed_nozzle = report_nozzle_diameter(report)
    if installed_nozzle is not None:
        raw_status["installed_nozzle_diameter"] = installed_nozzle
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
        "installed_nozzle_diameter": installed_nozzle,
        "raw_status": raw_status,
    }


def remember_latest_report(report: dict) -> None:
    with LATEST_REPORT_LOCK:
        LATEST_PRINTER_REPORT.clear()
        LATEST_PRINTER_REPORT.update(json.loads(json.dumps(report)))


def ams_only_payload(report: dict) -> dict:
    """Build an AMS-only status update without changing general printer state."""
    payload = status_payload(report)
    return {
        "ams_only": True,
        "ams_slots": payload.get("ams_slots") or [],
    }


def request_ams_refresh(timeout_seconds: int = 20) -> bool:
    """Ask Bambu Cloud for fresh AMS data without refreshing other systems."""
    AMS_REFRESH_COMPLETED.clear()
    AMS_REFRESH_REQUESTED.set()
    if AMS_REFRESH_COMPLETED.wait(timeout=max(1, timeout_seconds)):
        return True
    with LATEST_REPORT_LOCK:
        snapshot = json.loads(json.dumps(LATEST_PRINTER_REPORT)) if LATEST_PRINTER_REPORT else {}
    if snapshot:
        forward(ams_only_payload(snapshot))
        print("AMS-refresh gebruikte de laatste live MQTT-status na een printertimeout.", flush=True)
        return True
    print("AMS-refresh kreeg nog geen MQTT-data en blijft openstaan voor een nieuwe poging.", flush=True)
    return False


def request_manual_status_refresh(timeout_seconds: int = 20) -> bool:
    """Refresh host, VM, printer and AMS data before an SD scan."""
    refresh_machine_reachability()
    MANUAL_STATUS_REFRESH_COMPLETED.clear()
    MANUAL_STATUS_REFRESH_REQUESTED.set()
    if MANUAL_STATUS_REFRESH_COMPLETED.wait(timeout=max(1, timeout_seconds)):
        return True
    with LATEST_REPORT_LOCK:
        snapshot = json.loads(json.dumps(LATEST_PRINTER_REPORT)) if LATEST_PRINTER_REPORT else {}
    if snapshot:
        forward(status_payload(snapshot))
        print("Handmatige statusrefresh gebruikte de laatste live MQTT-status na een printertimeout.", flush=True)
        return True
    print("Handmatige statusrefresh kreeg nog geen MQTT-data; mappen- en bestandsscan gaan wel door.", flush=True)
    return False


def forward(payload: dict, retry_after_refresh: bool = False) -> None:
    token_used = BRIDGE_TOKEN
    try:
        website_execution("bridge", "status", {"printer_id": PRINTER_ID, "bridge_token": token_used, "payload": payload}, timeout=15)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")
        try:
            message = str(json.loads(detail).get("error") or detail)
        except (json.JSONDecodeError, AttributeError):
            message = detail or exc.reason
        if exc.code == 403:
            raise BridgeAuthorizationError(
                "Appwrite weigert de blijvende bridge-token; automatische tokenvernieuwing staat uit."
            ) from exc
        raise RuntimeError(f"Status doorsturen mislukt ({exc.code}): {message[:300]}") from exc


def home_assistant_headers() -> dict[str, str]:
    return {"authorization": f"Bearer {SUPERVISOR_TOKEN}"} if SUPERVISOR_TOKEN else {}


def home_assistant_entity_state(entity_id: str) -> str:
    if not entity_id or not SUPERVISOR_TOKEN:
        return "unknown"
    entity = urllib.parse.quote(entity_id, safe="._-")
    request = urllib.request.Request(
        f"http://supervisor/core/api/states/{entity}",
        headers=home_assistant_headers(),
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        return str(json.loads(response.read().decode()).get("state") or "").strip().lower()


def call_home_assistant_entity(entity_id: str) -> None:
    if not entity_id or not SUPERVISOR_TOKEN or "." not in entity_id:
        raise RuntimeError(f"Home Assistant-entiteit is niet uitvoerbaar: {entity_id or 'leeg'}")
    domain = entity_id.split(".", 1)[0]
    service = "press" if domain in {"button", "input_button"} else "turn_on"
    request = urllib.request.Request(
        f"http://supervisor/core/api/services/{domain}/{service}",
        data=json.dumps({"entity_id": entity_id}).encode(),
        method="POST",
        headers={**home_assistant_headers(), "content-type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=15):
        pass


def wait_for_entity_available(entity_id: str, timeout_seconds: int) -> str:
    deadline = time.monotonic() + max(30, timeout_seconds)
    last_state = "unknown"
    while time.monotonic() < deadline:
        last_state = home_assistant_entity_state(entity_id)
        if last_state not in {"unavailable", "unknown", "none", ""}:
            return last_state
        time.sleep(5)
    raise RuntimeError(f"{entity_id} bleef {last_state} binnen de ingestelde wachttijd")


def publish_scan_state(state: str, kind: str, request_id: int, detail: str = "") -> None:
    if not SUPERVISOR_TOKEN:
        return
    payload = {"state": state, "attributes": {"friendly_name": "Overweel3D FTPS-scan", "scan_type": kind, "request_id": request_id, "detail": detail, "icon": "mdi:folder-search-outline"}}
    request = urllib.request.Request("http://supervisor/core/api/states/sensor.overweel3d_ftps_scan", data=json.dumps(payload).encode(), method="POST", headers={**home_assistant_headers(), "content-type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=10):
            pass
    except Exception as exc:
        print(f"HA-scanstatus kon niet worden bijgewerkt: {exc}", flush=True)


def bridge_control_request(payload: dict) -> dict:
    action = str(payload.get("action") or "onbekend")
    token_used = BRIDGE_TOKEN
    try:
        return website_execution("bridge", "control", {"printer_id": PRINTER_ID, "bridge_token": token_used, "payload": payload}, timeout=25)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")
        if exc.code == 403:
            raise BridgeAuthorizationError(
                "Appwrite weigert de blijvende bridge-token; automatische tokenvernieuwing staat uit."
            ) from exc
        raise RuntimeError(f"Bridgeactie '{action}' mislukt ({exc.code}): {detail[:300]}") from exc


def normalize_bambu_catalog_material(value: object) -> str:
    material = str(value or "").strip().upper().replace("_", " ")
    for prefix in ("PETG", "PLA", "TPU", "ABS", "ASA", "PC", "PA", "PVA", "PPS", "PET"):
        if material.startswith(prefix):
            return prefix
    return material.split(" ", 1)[0]


def parse_bambu_color_catalog(payload: dict) -> list[dict]:
    """Reduce BambuStudio's official colour catalog to unique website proposals."""
    unique: dict[str, dict] = {}
    for item in payload.get("data") or []:
        if not isinstance(item, dict):
            continue
        colors = item.get("fila_color") or []
        raw_hex = str(colors[0] if colors else "").strip().lstrip("#")
        if len(raw_hex) < 6 or not re.fullmatch(r"[0-9a-fA-F]{6,8}", raw_hex):
            continue
        material = normalize_bambu_catalog_material(item.get("fila_type"))
        names = item.get("fila_color_name") if isinstance(item.get("fila_color_name"), dict) else {}
        name = str(names.get("nl") or names.get("en") or "").strip()
        if not material or not name:
            continue
        color_hex = "#" + raw_hex[:6].upper()
        source_id = str(item.get("fila_id") or "unknown").strip()
        color_code = str(item.get("fila_color_code") or item.get("color_code") or color_hex[1:]).strip()
        key = f"{material}|{name.casefold()}|{color_hex}"
        unique[key] = {
            "catalog_key": f"{source_id}:{color_code}",
            "name": name,
            "material": material,
            "color_hex": color_hex,
            "filament_type": str(item.get("fila_type") or material).strip(),
        }
    return list(unique.values())


def fetch_bambu_color_catalog() -> list[dict]:
    request = urllib.request.Request(
        BAMBU_COLOR_CATALOG_URL,
        headers={"user-agent": "Overweel3D-Bambu-Bridge/1.32"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return parse_bambu_color_catalog(json.loads(response.read().decode("utf-8")))


def bambu_color_catalog_loop() -> None:
    """Synchronize official Bambu colour proposals immediately and hourly."""
    while True:
        retry_seconds = BAMBU_COLOR_CATALOG_INTERVAL_SECONDS
        try:
            colors = fetch_bambu_color_catalog()
            result = bridge_control_request({"action": "sync_bambu_color_catalog", "colors": colors})
            print(
                f"Bambu-kleurcatalogus vergeleken: {len(colors)} unieke kleuren; "
                f"{int(result.get('new_proposals') or 0)} nieuw voorgesteld, "
                f"{int(result.get('open_proposals') or 0)} voorstel(len) open.",
                flush=True,
            )
        except Exception as exc:
            print(f"Bambu-kleurcatalogus tijdelijk niet beschikbaar: {exc}", flush=True)
            retry_seconds = 5 * 60
        time.sleep(retry_seconds)


class ImplicitFTP_TLS(ftplib.FTP_TLS):
    """Bambu printers expose implicit FTPS on port 990."""

    def connect(self, host="", port=0, timeout=-999, source_address=None):
        if host:
            self.host = host
        if port:
            self.port = port
        if timeout != -999:
            self.timeout = timeout
        self.sock = socket.create_connection((self.host, self.port), self.timeout, source_address=source_address)
        self.af = self.sock.family
        self.sock = self.context.wrap_socket(self.sock, server_hostname=self.host)
        self.file = self.sock.makefile("r", encoding=self.encoding)
        self.welcome = self.getresp()
        return self.welcome

def parse_3mf_metadata(content: bytes) -> tuple[list[dict], list[dict]]:
    plates: dict[int, dict] = {}
    configured_filaments: list[dict] = []
    used_filaments: list[dict] = []
    project_nozzle: float | None = None
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            names = archive.namelist()
            name_lookup = {name.lower(): name for name in names}
            for member in names:
                match = re.search(r"(?:^|/)plate_(\d+)\.gcode$", member, re.I)
                if match:
                    number = int(match.group(1))
                    plates[number] = {"number": number, "name": f"Plaat {number}", "detected_filaments": [], "printable": True}

            for name in [item for item in names if item.lower().endswith("project_settings.config")]:
                try:
                    settings = json.loads(archive.read(name))
                except (json.JSONDecodeError, UnicodeDecodeError, AttributeError):
                    continue
                for key in ("nozzle_diameter", "nozzle_diameters", "machine_nozzle_size", "printer_nozzle_diameter"):
                    normalized_nozzle = normalize_nozzle_diameter(settings.get(key))
                    if normalized_nozzle is not None:
                        project_nozzle = normalized_nozzle
                        break
                colors = settings.get("filament_colour") or settings.get("filament_color") or []
                materials = settings.get("filament_type") or []
                for index, color in enumerate(colors):
                    item = {"material": str(materials[index]).upper() if index < len(materials) else None, "color_name": None, "color_hex": str(color)[:7].upper()}
                    if re.fullmatch(r"#[0-9A-F]{6}", item["color_hex"]) and item not in configured_filaments:
                        configured_filaments.append(item)

            # A Bambu project can contain several populated plates even when only
            # one (or none) has embedded G-code.  The per-plate JSON files are the
            # most reliable inventory in both sliced and unsliced 3MF exports.
            # Previously these were ignored, which made such files appear as one
            # plate because the fast SD scan deliberately starts with a placeholder.
            for member in names:
                match = re.search(r"(?:^|/)plate_(\d+)\.json$", member, re.I)
                if not match:
                    continue
                try:
                    plate_json = json.loads(archive.read(member))
                except (json.JSONDecodeError, UnicodeDecodeError, AttributeError, KeyError):
                    continue
                objects = plate_json.get("bbox_objects")
                # Do not count empty/template plates. Older exports may omit
                # bbox_objects entirely, in which case bbox_all still proves that
                # the plate has content.
                if isinstance(objects, list) and not objects:
                    continue
                if objects is None and not plate_json.get("bbox_all"):
                    continue
                number = int(match.group(1))
                entry = plates.setdefault(number, {
                    "number": number,
                    "name": f"Plaat {number}",
                    "detected_filaments": [],
                    "printable": False,
                })
                json_colors = plate_json.get("filament_colors") or []
                json_ids = plate_json.get("filament_ids") or []
                json_filaments: list[dict] = []
                for position, raw_color in enumerate(json_colors):
                    color = str(raw_color)[:7].upper()
                    try:
                        filament_index = int(json_ids[position]) if position < len(json_ids) else position
                    except (TypeError, ValueError):
                        filament_index = position
                    configured = configured_filaments[filament_index] if 0 <= filament_index < len(configured_filaments) else None
                    item = {
                        "filament_index": filament_index + 1,
                        "material": configured.get("material") if configured else None,
                        "color_name": None,
                        "color_hex": color if re.fullmatch(r"#[0-9A-F]{6}", color) else None,
                    }
                    if item["color_hex"] and not any(existing.get("color_hex") == item["color_hex"] and existing.get("material") == item["material"] for existing in json_filaments):
                        json_filaments.append(item)
                if json_filaments and not entry["detected_filaments"]:
                    entry["detected_filaments"] = json_filaments
                for item in json_filaments:
                    if not any(existing.get("color_hex") == item["color_hex"] and existing.get("material") == item["material"] for existing in used_filaments):
                        used_filaments.append(item)

            for name in [item for item in names if item.lower().endswith(("slice_info.config", "model_settings.config"))]:
                try:
                    root = ET.fromstring(archive.read(name))
                except (ET.ParseError, KeyError):
                    continue
                for plate_element in [element for element in root.iter() if element.tag.lower().endswith("plate")]:
                    metadata = {child.attrib.get("key"): child.attrib.get("value") for child in plate_element if child.attrib.get("key")}
                    raw_number = plate_element.attrib.get("plate_id") or plate_element.attrib.get("plate") or plate_element.attrib.get("index") or plate_element.attrib.get("id")
                    raw_number = metadata.get("plate_id") or metadata.get("plater_id") or metadata.get("index") or raw_number
                    try:
                        number = int(str(raw_number))
                    except (TypeError, ValueError):
                        continue
                    plate_filaments: list[dict] = []
                    for filament in [element for element in plate_element.iter() if element.tag.lower().endswith("filament")]:
                        color = (filament.attrib.get("color") or "")[:7].upper()
                        material = filament.attrib.get("type") or filament.attrib.get("name")
                        item = {
                            "material": material.upper() if material else None,
                            "color_name": None,
                            "color_hex": color,
                            "used_grams": float(filament.attrib["used_g"]) if filament.attrib.get("used_g") else None,
                        }
                        if re.fullmatch(r"#[0-9A-F]{6}", color) and not any(existing["color_hex"] == color and existing["material"] == item["material"] for existing in plate_filaments):
                            plate_filaments.append(item)
                        if re.fullmatch(r"#[0-9A-F]{6}", color) and not any(existing["color_hex"] == color and existing["material"] == item["material"] for existing in used_filaments):
                            used_filaments.append(item)
                    gcode_file = str(metadata.get("gcode_file") or "")
                    has_gcode = bool(gcode_file) or bool(plates.get(number, {}).get("printable"))
                    has_models = any(element.tag.lower().endswith(("object", "model_instance")) for element in plate_element)
                    if has_gcode or has_models or plate_filaments or number in plates:
                        plate_name = metadata.get("plater_name") or metadata.get("plate_name") or metadata.get("name") or plate_element.attrib.get("name")
                        entry = plates.setdefault(number, {"number": number, "name": plate_name or f"Plaat {number}", "detected_filaments": [], "printable": False})
                        if gcode_file and gcode_file.lower() in name_lookup:
                            entry["printable"] = True
                        if plate_name:
                            entry["name"] = plate_name
                        if plate_filaments:
                            entry["detected_filaments"] = plate_filaments
                        for key in ("nozzle_diameter", "nozzle_diameters", "machine_nozzle_size", "printer_nozzle_diameter"):
                            normalized_nozzle = normalize_nozzle_diameter(metadata.get(key) or plate_element.attrib.get(key))
                            if normalized_nozzle is not None:
                                entry["nozzle_diameter"] = normalized_nozzle
                                break
                        thumbnail_path = metadata.get("thumbnail_file")
                        resolved_thumbnail = name_lookup.get(str(thumbnail_path or "").lower())
                        if resolved_thumbnail and archive.getinfo(resolved_thumbnail).file_size <= 2 * 1024 * 1024:
                            entry["preview_data_url"] = "data:image/png;base64," + base64.b64encode(archive.read(resolved_thumbnail)).decode("ascii")

            # Some project-only exports have no plate nodes in slice_info and no
            # thumbnail reference in model_settings. Attach the conventional
            # plate_N.png preview after all plate sources have been merged.
            for number, entry in plates.items():
                if entry.get("nozzle_diameter") is None:
                    embedded_gcode = name_lookup.get(f"metadata/plate_{number}.gcode")
                    if embedded_gcode:
                        try:
                            parsed_plates, _ = parse_gcode_metadata(archive.read(embedded_gcode), number, entry.get("name") or "")
                            if parsed_plates and parsed_plates[0].get("nozzle_diameter") is not None:
                                entry["nozzle_diameter"] = parsed_plates[0]["nozzle_diameter"]
                        except (KeyError, OSError):
                            pass
                if entry.get("nozzle_diameter") is None and project_nozzle is not None:
                    entry["nozzle_diameter"] = project_nozzle
                if entry.get("preview_data_url"):
                    continue
                preview = name_lookup.get(f"metadata/plate_{number}.png")
                if preview and archive.getinfo(preview).file_size <= 2 * 1024 * 1024:
                    entry["preview_data_url"] = "data:image/png;base64," + base64.b64encode(archive.read(preview)).decode("ascii")
    except (zipfile.BadZipFile, OSError):
        return [], []
    filaments = used_filaments or configured_filaments
    for entry in plates.values():
        if not entry["detected_filaments"]:
            entry["detected_filaments"] = filaments
    return ([plates[number] for number in sorted(plates)], filaments)


def parse_3mf_plates(content: bytes) -> list[dict]:
    return parse_3mf_metadata(content)[0]


def parse_gcode_metadata(content: bytes, plate_number: int = 1, plate_name: str = "") -> tuple[list[dict], list[dict]]:
    text = content.decode("utf-8", errors="replace")

    def setting(pattern: str) -> str:
        match = re.search(pattern, text, re.I | re.M)
        return match.group(1).strip() if match else ""

    colors = [value.strip()[:7].upper() for value in re.split(r"[;,]", setting(r"^;\s*filament_colou?r\s*=\s*(.+)$")) if value.strip()]
    materials = [value.strip().upper() for value in re.split(r"[;,]", setting(r"^;\s*filament_type\s*=\s*(.+)$")) if value.strip()]
    used_indexes = [int(value) for value in re.findall(r"\d+", setting(r"^;\s*filament\s*:\s*(.+)$"))]
    weights: list[float] = []
    for value in re.split(r"[;,]", setting(r"^;\s*total filament weight\s*\[g\]\s*:\s*(.+)$")):
        try:
            weights.append(float(value.strip()))
        except ValueError:
            pass
    if not used_indexes:
        used_indexes = list(range(1, max(len(colors), len(materials)) + 1))
    filaments = []
    for used_position, filament_index in enumerate(used_indexes):
        index = filament_index - 1
        color = colors[index] if index < len(colors) else None
        filaments.append({
            "filament_index": filament_index,
            "material": materials[index] if index < len(materials) else None,
            "color_name": None,
            "color_hex": color if color and re.fullmatch(r"#[0-9A-F]{6}", color) else None,
            "used_grams": weights[used_position] if used_position < len(weights) else None,
        })
    name = plate_name or setting(r"^;\s*(?:plate_name|plater_name)\s*=\s*(.+)$") or f"Plaat {plate_number}"
    nozzle = normalize_nozzle_diameter(setting(r"^;\s*(?:nozzle_diameters?|machine_nozzle_size|printer_nozzle_diameter)\s*[:=]\s*(.+)$"))
    return ([{"number": plate_number, "name": name, "detected_filaments": filaments, "nozzle_diameter": nozzle}], filaments)


def read_remote_print_metadata(ftp: ImplicitFTP_TLS, path: str, size: int | None, plate_number: int = 1, plate_name: str = "", cancellation_check=None, progress_callback=None) -> tuple[list[dict], list[dict]]:
    if size is not None and size > 256 * 1024 * 1024:
        raise ValueError("Printbestand is groter dan de veilige parseerlimiet van 256 MB")
    cleanup_download_cache()
    suffix = ".gcode" if path.lower().endswith(".gcode") else ".3mf"
    cached_path = download_cache_path(path, size)
    if cached_path.is_file():
        cached_size = cached_path.stat().st_size
        if size is None or cached_size == size:
            os.utime(cached_path, None)
            if progress_callback:
                progress_callback(cached_size, size or cached_size)
            print(f"Printbestand uit 48-uurscache gebruikt ({cached_size} bytes): {path}", flush=True)
            content = cached_path.read_bytes()
            return parse_gcode_metadata(content, plate_number, plate_name) if suffix == ".gcode" else parse_3mf_metadata(content)
        cached_path.unlink(missing_ok=True)

    partial_path = cached_path.with_name(cached_path.name + f".{uuid.uuid4().hex}.part")
    try:
        with partial_path.open("wb") as temporary:
            last_cancel_check = 0.0
            downloaded_bytes = 0
            def receive_block(block: bytes) -> None:
                nonlocal last_cancel_check, downloaded_bytes
                temporary.write(block)
                downloaded_bytes += len(block)
                now = time.monotonic()
                if cancellation_check and (last_cancel_check == 0.0 or now - last_cancel_check >= 1.0):
                    last_cancel_check = now
                    cancelled = progress_callback(downloaded_bytes, size) if progress_callback else cancellation_check()
                    if cancelled:
                        raise MetadataDownloadCancelled("Download geannuleerd door de admin.")
            ftp.retrbinary(f"RETR {path}", receive_block, blocksize=256 * 1024)
            if size is not None and downloaded_bytes != size:
                raise IOError(f"Download onvolledig: {downloaded_bytes} van {size} bytes ontvangen")
            if progress_callback:
                progress_callback(downloaded_bytes, size)
            if cancellation_check and cancellation_check():
                raise MetadataDownloadCancelled("Download geannuleerd door de admin.")
        partial_path.replace(cached_path)
        print(f"Printbestand gedownload en 48 uur gecachet ({cached_path.stat().st_size} bytes): {path}", flush=True)
        content = cached_path.read_bytes()
        return parse_gcode_metadata(content, plate_number, plate_name) if suffix == ".gcode" else parse_3mf_metadata(content)
    except Exception:
        partial_path.unlink(missing_ok=True)
        raise


def parse_ftp_directory_line(line: str) -> dict | None:
    """Parse common Unix, BusyBox and DOS FTP directory-listing formats."""
    text = str(line or "").strip()
    if not text or text.lower().startswith("total "):
        return None

    unix = re.match(
        r"^(?P<mode>[bcdlps-][^\s]*)\s+\d+\s+\S+\s+\S+\s+(?P<size>\d+)\s+"
        r"\S+\s+\d+\s+(?:\d{1,2}:\d{2}|\d{4})\s+(?P<name>.+)$",
        text,
    )
    if unix:
        name = unix.group("name").split(" -> ", 1)[0].strip()
        if name in {".", ".."}:
            return None
        return {
            "name": name,
            "type": "directory" if unix.group("mode").startswith("d") else "file",
            "size_bytes": int(unix.group("size")),
        }

    dos = re.match(
        r"^\d{2}[-/]\d{2}[-/]\d{2,4}\s+\d{1,2}:\d{2}(?:\s?[AP]M)?\s+"
        r"(?P<size><DIR>|\d+)\s+(?P<name>.+)$",
        text,
        re.I,
    )
    if dos:
        name = dos.group("name").strip()
        if name in {".", ".."}:
            return None
        is_directory = dos.group("size").upper() == "<DIR>"
        return {"name": name, "type": "directory" if is_directory else "file", "size_bytes": None if is_directory else int(dos.group("size"))}

    # Last-resort parser for unusual embedded FTP servers. maxsplit preserves
    # spaces inside the file name.
    parts = text.split(maxsplit=8)
    if len(parts) < 4:
        return None
    name = parts[-1].strip()
    if name in {".", ".."}:
        return None
    is_directory = parts[0].startswith("d") or any(part.upper() == "<DIR>" for part in parts[:-1])
    size = None
    for candidate in (parts[4:5] + parts[2:3]):
        try:
            size = int(candidate)
            break
        except (TypeError, ValueError):
            pass
    return {"name": name, "type": "directory" if is_directory else "file", "size_bytes": size}


def ftp_directory_entries(ftp: ImplicitFTP_TLS, directory: str) -> list[dict]:
    """Read a directory using MLSD first and a tolerant DIR fallback."""
    previous = ftp.pwd()
    try:
        ftp.cwd(directory)
        try:
            entries = []
            for name, facts in ftp.mlsd():
                clean_name = str(name or "").replace("\x00", "").strip()
                entry_type = str(facts.get("type") or "").lower()
                if clean_name in {"", ".", ".."} or entry_type in {"cdir", "pdir"}:
                    continue
                size = None
                try:
                    size = int(facts["size"]) if facts.get("size") is not None else None
                except (TypeError, ValueError):
                    pass
                entries.append({"name": clean_name, "type": "directory" if entry_type == "dir" else "file", "size_bytes": size})
            if entries:
                return entries
            # Some embedded FTP implementations accept MLSD but return an empty
            # result for non-empty directories. Verify once through DIR.
            lines: list[str] = []
            ftp.dir(lines.append)
            return [entry for line in lines if (entry := parse_ftp_directory_line(line)) is not None]
        except (AttributeError, ftplib.Error, OSError, EOFError):
            lines: list[str] = []
            ftp.dir(lines.append)
            return [entry for line in lines if (entry := parse_ftp_directory_line(line)) is not None]
    finally:
        ftp.cwd(previous)


def is_supported_print_file(path: str) -> bool:
    clean = str(path or "").strip().lower()
    return clean.endswith((".gcode.3mf", ".3mf", ".gcode"))


def infer_filaments_from_name(filename: str) -> list[dict[str, str | None]]:
    searchable = re.sub(r"[^a-z0-9]+", " ", filename.lower())
    material = next((value.upper() for value in ("pla", "petg", "abs", "asa", "tpu", "pc", "pa") if re.search(rf"\b{value}\b", searchable)), None)
    colors = {
        "black": "Zwart", "zwart": "Zwart", "white": "Wit", "wit": "Wit",
        "blue": "Blauw", "blauw": "Blauw", "red": "Rood", "rood": "Rood",
        "green": "Groen", "groen": "Groen", "yellow": "Geel", "geel": "Geel",
        "orange": "Oranje", "oranje": "Oranje", "pink": "Roze", "roze": "Roze",
        "purple": "Paars", "paars": "Paars", "grey": "Grijs", "gray": "Grijs", "grijs": "Grijs",
        "brown": "Bruin", "bruin": "Bruin", "transparent": "Transparant", "translucent": "Transparant",
    }
    detected: list[dict[str, str | None]] = []
    for token, label in colors.items():
        if re.search(rf"\b{token}\b", searchable) and not any(item["color_name"] == label for item in detected):
            detected.append({"material": material, "color_name": label})
    return detected or ([{"material": material, "color_name": None}] if material else [])


def infer_filament_from_name(filename: str) -> tuple[str | None, str | None]:
    detected = infer_filaments_from_name(filename)
    return (detected[0]["material"], detected[0]["color_name"]) if detected else (None, None)


def list_sd_files(scan_paths: list[str], include_print_files: bool = True) -> tuple[list[dict], list[dict]]:
    if not BAMBU_HOST or not BAMBU_ACCESS_CODE:
        return [], []
    # The printer presents a device-local self-signed certificate on FTPS.
    ftp = ImplicitFTP_TLS(timeout=30, context=printer_tls_context())
    try:
        ftp.connect(BAMBU_HOST, FTPS_PORT)
        ftp.login(FTPS_USERNAME, BAMBU_ACCESS_CODE)
        ftp.prot_p()
        found: dict[str, dict] = {}
        gcode_groups: dict[str, dict] = {}
        listing: dict[str, dict] = {}
        readable_directories = 0
        pending_directories = list(scan_paths)
        visited_directories: set[str] = set()
        failed_directories: list[str] = []
        while pending_directories and len(visited_directories) < 5000:
            directory = pending_directories.pop(0)
            directory = "/" + str(directory or "/").strip().strip("/")
            if directory == "//":
                directory = "/"
            if directory in visited_directories:
                continue
            visited_directories.add(directory)
            entries = None
            for directory_attempt in range(1, 4):
                try:
                    entries = ftp_directory_entries(ftp, directory)
                    break
                except ftplib.all_errors as exc:
                    if directory_attempt < 3:
                        print(f"FTPS-map {directory} lezen mislukt (poging {directory_attempt}/3): {exc}", flush=True)
                        time.sleep(directory_attempt)
            if entries is None:
                failed_directories.append(directory)
                continue
            readable_directories += 1
            for entry in entries:
                normalized = str(entry["name"]).replace("\\", "/")
                if not normalized.startswith("/"):
                    normalized = (directory.rstrip("/") + "/" + normalized).replace("//", "/")
                if entry["type"] == "directory":
                    listing[normalized] = {"path": normalized, "type": "directory"}
                    if normalized not in visited_directories:
                        pending_directories.append(normalized)
                    continue
                listed_size = entry.get("size_bytes")
                listing[normalized] = {"path": normalized, "type": "file", "size_bytes": listed_size}
                if not include_print_files:
                    continue
                if normalized.lower().endswith(".gcode"):
                    filename = Path(normalized).name
                    plate_match = re.search(r"^(.*?)(?:[_-]?plate[_-]?)(\d+)\.gcode$", filename, re.I)
                    if plate_match:
                        number = int(plate_match.group(2))
                        prefix = plate_match.group(1).strip("_- ") or Path(normalized).parent.name or "print"
                        detected = infer_filaments_from_name(filename)
                        material = detected[0]["material"] if detected else None
                        color = detected[0]["color_name"] if detected else None
                        group_key = f"{Path(normalized).parent.as_posix()}/{prefix}".lower()
                        group = gcode_groups.setdefault(group_key, {
                            "path": normalized.lstrip("/"), "display_name": f"{prefix} · G-codeplaten",
                            "size_bytes": 0, "plates": [], "detected_material": material, "detected_color_name": color,
                            "detected_filaments": [],
                        })
                        group["size_bytes"] += listed_size or 0
                        plate_name = re.sub(r"[_-]?plate[_-]?\d+$", "", Path(filename).stem, flags=re.I).strip("_- ") or f"Plaat {number}"
                        group["plates"].append({"number": number, "name": plate_name, "path": normalized.lstrip("/"), "size_bytes": listed_size, "detected_filaments": detected})
                        for filament in detected:
                            if filament not in group["detected_filaments"]:
                                group["detected_filaments"].append(filament)
                    else:
                        detected = infer_filaments_from_name(filename)
                        material = detected[0]["material"] if detected else None
                        color = detected[0]["color_name"] if detected else None
                        found[normalized] = {
                            "path": normalized.lstrip("/"),
                            "display_name": filename,
                            "size_bytes": listed_size,
                            "plates": [{"number": 1, "name": Path(filename).stem, "path": normalized.lstrip("/"), "size_bytes": listed_size, "detected_filaments": detected}],
                            "detected_material": material,
                            "detected_color_name": color,
                            "detected_filaments": detected,
                        }
                    continue
                if not is_supported_print_file(normalized):
                    continue
                size = listed_size
                detected = infer_filaments_from_name(Path(normalized).name)
                material = detected[0]["material"] if detected else None
                color = detected[0]["color_name"] if detected else None
                if size is not None and size > 512 * 1024 * 1024:
                    print(f"SD-bestand overgeslagen (groter dan 512 MB): {normalized}", flush=True)
                    continue
                # Keep directory scans fast. Exact 3MF metadata is read lazily
                # only after an admin selects this file in the website.
                plate_entries = [{"number": 1, "name": re.sub(r"(?:\.gcode)?\.3mf$", "", Path(normalized).name, flags=re.I), "detected_filaments": detected}]
                found[normalized] = {
                    "path": normalized.lstrip("/"),
                    "display_name": Path(normalized).name,
                    "size_bytes": size,
                    "plates": plate_entries,
                    "detected_material": material,
                    "detected_color_name": color,
                    "detected_filaments": detected,
                }
        if not readable_directories:
            raise ConnectionError("Geen van de gekozen FTPS-mappen kon worden gelezen")
        if pending_directories:
            print(f"FTPS-scan bereikte de veiligheidslimiet van 5000 mappen; {len(pending_directories)} map(pen) wachten nog.", flush=True)
        if failed_directories:
            print(f"FTPS-scan kon {len(failed_directories)} map(pen) na drie pogingen niet lezen: {', '.join(failed_directories[:10])}", flush=True)
        for group in gcode_groups.values():
            group["plates"].sort(key=lambda plate: plate["number"])
            virtual_path = "gcode-group:" + hashlib.sha256((group["display_name"] + group["path"]).encode()).hexdigest()[:16]
            found[virtual_path] = {**group, "path": virtual_path}
        return list(found.values()), sorted(listing.values(), key=lambda item: (item["type"] != "directory", item["path"].lower()))
    finally:
        try:
            ftp.quit()
        except ftplib.all_errors:
            ftp.close()


def sync_sd_files(scan_paths: list[str], request_id: int = 0) -> None:
    if not BAMBU_HOST or not BAMBU_ACCESS_CODE:
        raise RuntimeError("FTPS-scan kan nog niet starten: printer-IP of lokale toegangscode ontbreekt in de websitekoppeling")
    last_error = None
    for attempt in range(1, 4):
        try:
            files, listing = list_sd_files(scan_paths)
            break
        except Exception as exc:
            last_error = exc
            if attempt < 3:
                delay = attempt * 3
                print(f"FTPS-scanpoging {attempt} mislukt; nieuwe poging over {delay} seconden: {exc}", flush=True)
                time.sleep(delay)
    else:
        raise RuntimeError(f"FTPS-scan mislukt na 3 pogingen: {last_error}")
    queue_request({"action": "sync_files", "files": files, "directory_listing": listing, "request_id": request_id})
    print(f"SD-kaart recursief vernieuwd: {len(files)} printbestand(en) vanaf {len(scan_paths)} startmap(pen) gevonden.", flush=True)


def sync_sd_directories(request_id: int = 0) -> None:
    if not BAMBU_HOST or not BAMBU_ACCESS_CODE:
        raise RuntimeError("FTPS-mappenscan kan nog niet starten: printer-IP of lokale toegangscode ontbreekt in de websitekoppeling")
    _, listing = list_sd_files(["/"], include_print_files=False)
    queue_request({"action": "sync_directories", "directory_listing": listing, "request_id": request_id})
    count = sum(1 for entry in listing if entry.get("type") == "directory")
    print(f"FTPS-mappen vernieuwd: {count} map(pen) gevonden.", flush=True)


def metadata_download_targets(request: dict) -> list[dict]:
    """Return every physical file that belongs to one selected SD-card item."""
    virtual_path = str(request.get("path") or "").lstrip("/")
    requested_plate = int(request.get("metadata_requested_plate_number") or 1)
    if virtual_path.startswith("gcode-group:"):
        targets = []
        for item in sorted(request.get("plates") or [], key=lambda plate: int(plate.get("number") or 0)):
            item_path = str(item.get("path") or "").lstrip("/")
            if not item_path:
                continue
            targets.append({
                "path": item_path,
                "size": int(item["size_bytes"]) if item.get("size_bytes") is not None else None,
                "plate_number": int(item.get("number") or 1),
                "plate_name": str(item.get("name") or f"Plaat {int(item.get('number') or 1)}"),
            })
        if not targets:
            raise ValueError("Deze G-codegroep bevat geen downloadbare platen; scan de bestanden opnieuw.")
        return targets
    if not virtual_path:
        raise ValueError("Het bestandspad ontbreekt; scan de bestanden opnieuw.")
    return [{
        "path": virtual_path,
        "size": int(request["size_bytes"]) if request.get("size_bytes") is not None else None,
        "plate_number": requested_plate,
        "plate_name": str(request.get("display_name") or f"Plaat {requested_plate}"),
    }]


def sync_requested_file_metadata(request: dict) -> None:
    file_id = str(request.get("id") or "")
    request_id = int(request.get("metadata_request_id") or 0)
    if not file_id or not request_id:
        return
    targets = metadata_download_targets(request)
    print(
        f"Volledige tijdelijke parse gestart voor {request.get('display_name') or request.get('path')} "
        f"(aanvraag #{request_id}, {len(targets)} bestand(en)).",
        flush=True,
    )
    ftp = ImplicitFTP_TLS(timeout=30, context=printer_tls_context())
    try:
        ftp.connect(BAMBU_HOST, FTPS_PORT)
        ftp.login(FTPS_USERNAME, BAMBU_ACCESS_CODE)
        ftp.prot_p()
        for target in targets:
            if target["size"] is None:
                try:
                    target["size"] = ftp.size("/" + target["path"])
                except ftplib.all_errors:
                    target["size"] = None
        total_size = sum(target["size"] for target in targets) if all(target["size"] is not None for target in targets) else None
        def cancelled() -> bool:
            status = queue_request({"action": "metadata_status", "file_id": file_id, "request_id": request_id})
            return bool(status.get("cancelled"))
        def report_progress(downloaded: int, total: int | None) -> bool:
            status = queue_request({"action": "metadata_progress", "file_id": file_id, "request_id": request_id, "downloaded_bytes": downloaded, "total_bytes": total})
            percent = min(100, round(downloaded * 100 / total)) if total else 0
            print(f"Tijdelijke metadata-download: {percent}% ({downloaded}/{total or '?'} bytes).", flush=True)
            return bool(status.get("cancelled"))
        report_progress(0, total_size)
        plates: list[dict] = []
        filaments: list[dict] = []
        cached_files: list[dict] = []
        downloaded_before_target = 0
        for target in targets:
            target_downloaded = 0
            def target_progress(downloaded: int, _target_size: int | None) -> bool:
                nonlocal target_downloaded
                target_downloaded = downloaded
                return report_progress(downloaded_before_target + downloaded, total_size)
            parsed_plates, parsed_filaments = read_remote_print_metadata(
                ftp, "/" + target["path"], target["size"], target["plate_number"], target["plate_name"], cancelled, target_progress,
            )
            cached_path = download_cache_path(target["path"], target["size"])
            if not cached_path.is_file():
                raise IOError(f"Download is verwerkt maar ontbreekt in de 48-uurscache: {target['path']}")
            cached_size = cached_path.stat().st_size
            if cached_size <= 0:
                raise IOError(f"Leeg bestand in de 48-uurscache: {target['path']}")
            cached_files.append({
                "path": target["path"],
                "cache_file": cached_path.name,
                "size_bytes": cached_size,
                "expires_at": int(cached_path.stat().st_mtime + DOWNLOAD_CACHE_TTL_SECONDS),
            })
            plates.extend(parsed_plates)
            for filament in parsed_filaments:
                if filament not in filaments:
                    filaments.append(filament)
            downloaded_before_target += target_downloaded
        # Rebuild the plate list from the fully downloaded content.  A quick SD
        # scan may contain a one-plate placeholder, but it must never survive a
        # successful full parse. Merge duplicate discoveries by plate number and
        # keep the richest metadata (name, preview, filaments and printability).
        merged_plates: dict[int, dict] = {}
        for parsed_plate in plates:
            number = int(parsed_plate.get("number") or 0)
            if number <= 0:
                continue
            current = merged_plates.get(number, {})
            merged = {**current, **{key: value for key, value in parsed_plate.items() if value not in (None, "", [])}}
            merged["number"] = number
            if current.get("detected_filaments") and not parsed_plate.get("detected_filaments"):
                merged["detected_filaments"] = current["detected_filaments"]
            merged_plates[number] = merged
        plates = [merged_plates[number] for number in sorted(merged_plates)]
        if not plates:
            raise ValueError("Het volledige bestand is gedownload, maar er zijn geen printbare platen gevonden.")
        completed_total = total_size if total_size is not None else downloaded_before_target
        cache_expires_at = min(item["expires_at"] for item in cached_files)
        completion = queue_request({
            "action": "sync_file_metadata",
            "file_id": file_id,
            "request_id": request_id,
            "plate_count": len(plates),
            "plates": plates,
            "detected_filaments": filaments,
            "downloaded_bytes": downloaded_before_target,
            "total_bytes": completed_total,
            "cache_expires_at": cache_expires_at,
            "cached_files": cached_files,
        })
        if completion.get("success") is not True:
            raise RuntimeError("Appwrite heeft de bijgewerkte plaat- en cachegegevens niet bevestigd.")
        print(
            f"Volledige parse #{request_id} voltooid en bevestigd: {len(plates)} plaat/platen, "
            f"{len(filaments)} kleur(en) en {len(cached_files)} bestand(en) 48 uur in cache.",
            flush=True,
        )
    except Exception as exc:
        queue_request({"action": "sync_file_metadata", "file_id": file_id, "request_id": request_id, "error": str(exc), "plates": [], "detected_filaments": []})
        print(f"Volledige parse #{request_id} mislukt: {exc}", flush=True)
    finally:
        try:
            ftp.quit()
        except ftplib.all_errors:
            ftp.close()


def start_requested_file_metadata(request: dict) -> bool:
    """Parse in a worker so a slow FTPS transfer never blocks new commands."""
    request_key = f"{request.get('id')}:{request.get('metadata_request_id')}"
    with METADATA_LOCK:
        if request_key in METADATA_ACTIVE:
            return False
        METADATA_ACTIVE.add(request_key)

    def worker() -> None:
        try:
            sync_requested_file_metadata(request)
        finally:
            with METADATA_LOCK:
                METADATA_ACTIVE.discard(request_key)

    threading.Thread(target=worker, name=f"metadata-{request.get('id')}", daemon=True).start()
    return True


def bridge_control_loop() -> None:
    """Handle only AMS refresh requests; print queue and SD scanning are removed."""
    print(f"AMS-ververslistener gestart voor websiteprinter {PRINTER_ID}.", flush=True)
    while True:
        try:
            config = bridge_control_request({"action": "scan_config"})
            ams_request_marker = int(config.get("ams_refresh_request_id") or 0)
            completed_ams_request = int(config.get("ams_refresh_completed_request_id") or 0)
            if ams_request_marker > completed_ams_request:
                print(
                    f"AMS-refreshverzoek #{ams_request_marker} ontvangen "
                    f"(laatst bevestigd: #{completed_ams_request}).",
                    flush=True,
                )
                if request_ams_refresh():
                    bridge_control_request({"action": "ack_ams_refresh", "request_id": ams_request_marker})
                    print(f"AMS-refreshverzoek #{ams_request_marker} voltooid.", flush=True)
        except Exception as exc:
            print(f"AMS-verversverzoeken tijdelijk niet leesbaar: {exc}", flush=True)
        time.sleep(5)


def bambu_login_request_loop() -> None:
    """Process explicit website login-code requests, never request codes repeatedly."""
    last_handled = 0
    while True:
        try:
            config = bridge_control_request({"action": "scan_config"})
            requested = int(config.get("bambu_login_request_id") or 0)
            completed = int(config.get("bambu_login_completed_request_id") or 0)
            if requested > completed and requested != last_handled:
                last_handled = requested
                try:
                    api("/v1/user-service/user/sendemail/code", "POST", {"email": BAMBU_ACCOUNT, "type": "codeLogin"})
                    if TOKEN_FILE.exists():
                        TOKEN_FILE.unlink()
                    bridge_control_request({"action": "ack_bambu_login_code", "request_id": requested, "success": True})
                    print(
                        f"Handmatig Bambu-inlogcodeverzoek #{requested} uitgevoerd. "
                        f"De code is naar {BAMBU_ACCOUNT} gestuurd; vul hem in bij E-mailcode en herstart de add-on.",
                        flush=True,
                    )
                except Exception as exc:
                    bridge_control_request({"action": "ack_bambu_login_code", "request_id": requested, "success": False, "error": str(exc)})
                    print(f"Bambu-inlogcode aanvragen mislukt: {exc}", flush=True)
        except Exception as exc:
            print(f"Loginverzoeken tijdelijk niet leesbaar: {exc}", flush=True)
        time.sleep(5)


def ping_host(ip_address: str, timeout_seconds: int = 2) -> bool:
    """Perform a fresh ICMP check; callers must never substitute cached status."""
    if not ip_address:
        return False
    try:
        result = subprocess.run(
            ["ping", "-c", "1", "-W", str(max(1, timeout_seconds)), ip_address],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=max(2, timeout_seconds + 1),
            check=False,
        )
        return result.returncode == 0
    except (OSError, subprocess.SubprocessError):
        return False


def publish_host_pc_status(online: bool) -> None:
    try:
        queue_request({"action": "sync_host_pc_status", "status": "on" if online else "off"})
    except Exception as exc:
        print(f"Pc-status kon niet naar de website: {exc}", flush=True)


def publish_vm_status(online: bool) -> None:
    """Publish informational VM state; print decisions never consume this value."""
    try:
        queue_request({"action": "sync_vm_status", "status": "on" if online else "off"})
    except Exception as exc:
        print(f"VM-status kon niet naar de website: {exc}", flush=True)


def refresh_machine_reachability() -> tuple[bool, bool]:
    """Run fresh display-only checks when the admin requests a full refresh."""
    host_online = ping_host(HOST_PC_IP)
    vm_online = guest_is_ready() or ping_host(VM_IP)
    publish_host_pc_status(host_online)
    publish_vm_status(vm_online)
    print(
        f"Handmatige bereikbaarheid vernieuwd: pc={'aan' if host_online else 'uit'}, "
        f"VM={'aan' if vm_online else 'uit'}.",
        flush=True,
    )
    return host_online, vm_online


def host_status_loop() -> None:
    """Status-only loop; its result is intentionally never used for print startup."""
    while True:
        publish_host_pc_status(ping_host(HOST_PC_IP))
        time.sleep(max(30, HOST_STATUS_INTERVAL_SECONDS))


def vm_status_loop() -> None:
    """Publish VM reachability or a recent agent heartbeat for display only."""
    last_status: bool | None = None
    while True:
        online = guest_is_ready() or ping_host(VM_IP)
        publish_vm_status(online)
        if online != last_status:
            print(f"VM-weergavestatus bijgewerkt: {'aan' if online else 'uit'}.", flush=True)
            last_status = online
        time.sleep(max(30, HOST_STATUS_INTERVAL_SECONDS))


def guest_is_ready() -> bool:
    with GUEST_LOCK:
        return time.monotonic() - GUEST_LAST_SEEN < 15


def guest_client_allowed(client_ip: str) -> bool:
    """Accept token-authenticated clients from private/LAN address space.

    Home Assistant can see a VMware guest through a NAT or Docker proxy address,
    so comparing the source with the configured display/ping IP is unreliable.
    """
    try:
        address = ipaddress.ip_address(str(client_ip or "").strip())
        return address.is_private or address.is_loopback
    except ValueError:
        return False


class GuestThreadingHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 32


class GuestApiHandler(BaseHTTPRequestHandler):
    server_version = "Overweel3DGuestAPI/1.34.0"

    def log_message(self, pattern: str, *args: object) -> None:
        print("VM-API " + (pattern % args), flush=True)

    def authorized(self) -> bool:
        supplied = self.headers.get("Authorization", "")
        supplied_token = self.headers.get("X-Overweel3D-Token", "")
        client_ip = str(self.client_address[0] if self.client_address else "")
        if not guest_client_allowed(client_ip):
            print(f"VM-API verzoek geweigerd vanaf niet-privéadres {client_ip}.", flush=True)
            return False
        return secrets.compare_digest(supplied, f"Bearer {GUEST_API_TOKEN}") or secrets.compare_digest(supplied_token, GUEST_API_TOKEN)

    def read_json(self) -> dict:
        length = min(int(self.headers.get("Content-Length", "0") or 0), 1024 * 1024)
        value = json.loads(self.rfile.read(length) or b"{}")
        return value if isinstance(value, dict) else {}

    def answer(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(body)
        self.wfile.flush()
        self.close_connection = True

    def do_GET(self) -> None:
        global GUEST_LAST_SEEN
        parsed = urllib.parse.urlsplit(self.path)
        if parsed.path == "/guest/health":
            client_ip = str(self.client_address[0] if self.client_address else "")
            if not guest_client_allowed(client_ip):
                self.answer(403, {"error": "private network required"})
                return
            self.answer(200, {"ok": True, "service": "overweel3d-vm-api", "version": "1.34.0", "client_ip": client_ip})
            return
        if not self.authorized():
            self.answer(401, {"error": "unauthorized"})
            return
        if parsed.path == "/guest/printer":
            self.answer(200, {
                "host": BAMBU_HOST,
                "serial": BAMBU_SERIAL,
                "access_code": BAMBU_ACCESS_CODE,
                "ftps_username": FTPS_USERNAME,
                "ftps_port": FTPS_PORT,
            })
            return
        if parsed.path != "/guest/job":
            self.answer(404, {"error": "not found"})
            return
        job_id = (urllib.parse.parse_qs(parsed.query).get("job_id") or [""])[0]
        with GUEST_LOCK:
            GUEST_LAST_SEEN = time.monotonic()
            pending = GUEST_PENDING_JOB
        if not pending or pending.get("runner_job_id") != job_id:
            self.answer(404, {"error": "job not found"})
            return
        self.answer(200, pending["payload"])

    def do_POST(self) -> None:
        global GUEST_LAST_SEEN, GUEST_LAST_EVENT
        if not self.authorized():
            self.answer(401, {"error": "unauthorized"})
            return
        payload = self.read_json()
        if self.path == "/guest/vm-stopped":
            accepted = handle_vm_stopped_callback(payload)
            self.answer(200, {"ok": True, "host_shutdown_scheduled": accepted})
            return
        with GUEST_LOCK:
            GUEST_LAST_SEEN = time.monotonic()
            if self.path == "/guest/ready":
                pending = GUEST_PENDING_JOB
                GUEST_LOCK.notify_all()
                runner_job_id = pending.get("runner_job_id", "") if pending else ""
            else:
                runner_job_id = None
            if self.path == "/guest/event":
                pending = GUEST_PENDING_JOB
                if not pending or str(payload.get("job_id") or "") != str(pending.get("runner_job_id") or ""):
                    self.answer(409, {"error": "job does not match pending task"})
                    return
                GUEST_LAST_EVENT = payload
                GUEST_LOCK.notify_all()
        if self.path == "/guest/ready":
            self.answer(200, {"ok": True, "runner_job_id": runner_job_id or ""})
            return
        if self.path == "/guest/event":
            self.answer(200, {"ok": True})
            return
        self.answer(404, {"error": "not found"})


def start_guest_api() -> None:
    server = GuestThreadingHTTPServer(("0.0.0.0", GUEST_API_PORT), GuestApiHandler)
    print(f"VM-agent-API luistert op poort {GUEST_API_PORT}; privé-LAN-clients gebruiken tokenauthenticatie.", flush=True)
    server.serve_forever()


def dispatch_to_vm_guest(item: dict) -> dict:
    """Run the requested power sequence and hand one job directly to the VM."""
    global GUEST_PENDING_JOB
    item = dict(item)
    item["dry_run"] = queue_item_is_dry_run(item)
    item_id = str(item.get("id") or "")
    host_online = ping_host(HOST_PC_IP)
    publish_host_pc_status(host_online)
    if host_online:
        with GUEST_LOCK:
            HOST_STARTED_BY_ADDON_FOR.discard(item_id)
        print(f"Host-pc {HOST_PC_IP} reageert; wacht {HOST_ONLINE_DELAY_SECONDS} seconden.", flush=True)
        time.sleep(max(0, HOST_ONLINE_DELAY_SECONDS))
    else:
        call_home_assistant_entity(PC_POWER_ON_ENTITY)
        with GUEST_LOCK:
            if item_id:
                HOST_STARTED_BY_ADDON_FOR.add(item_id)
        print(f"Host-pc reageert niet; {PC_POWER_ON_ENTITY} eenmaal uitgevoerd.", flush=True)
        while not ping_host(HOST_PC_IP):
            time.sleep(5)
        publish_host_pc_status(True)
        print(f"Host-pc reageert; wacht {HOST_BOOT_DELAY_SECONDS} seconden na opstart.", flush=True)
        time.sleep(max(0, HOST_BOOT_DELAY_SECONDS))

    if not guest_is_ready():
        call_home_assistant_entity(VM_START_ENTITY)
        print(f"VM-agent niet actief; {VM_START_ENTITY} eenmaal uitgevoerd.", flush=True)
        deadline = time.monotonic() + max(30, VM_START_WAIT_SECONDS)
        with GUEST_LOCK:
            while time.monotonic() < deadline and time.monotonic() - GUEST_LAST_SEEN >= 15:
                GUEST_LOCK.wait(timeout=min(3, max(0.1, deadline - time.monotonic())))
        if not guest_is_ready():
            raise RuntimeError("VM-agent meldde zich niet binnen de ingestelde VM-opstartwachttijd")

    job_id = str(uuid.uuid4())
    with GUEST_LOCK:
        if GUEST_PENDING_JOB:
            raise RuntimeError("Er staat al een taak klaar voor de VM-agent")
        GUEST_PENDING_JOB = {
            "runner_job_id": job_id,
            "dispatched_at": time.monotonic(),
            "payload": {
                "job": item,
                "printer": {
                    "host": BAMBU_HOST,
                    "serial": BAMBU_SERIAL,
                    "access_code": BAMBU_ACCESS_CODE,
                    "ftps_username": FTPS_USERNAME,
                    "ftps_port": FTPS_PORT,
                },
            },
        }
        GUEST_LOCK.notify_all()
    print(f"VM-agenttaak {job_id} klaargezet: {item.get('file_name')} · plaat {item.get('plate_number')}.", flush=True)
    return {"accepted": True, "runner_job_id": job_id}


def clear_guest_job(item_id: str) -> None:
    global GUEST_PENDING_JOB
    with GUEST_LOCK:
        if GUEST_PENDING_JOB and str(GUEST_PENDING_JOB["payload"]["job"].get("id")) == str(item_id):
            GUEST_PENDING_JOB = None
            GUEST_LOCK.notify_all()


def take_guest_event(job_id: str) -> dict | None:
    global GUEST_LAST_EVENT
    with GUEST_LOCK:
        event = GUEST_LAST_EVENT
        if event and str(event.get("job_id") or "") == str(job_id or ""):
            GUEST_LAST_EVENT = None
            return event
        return None


def pending_guest_snapshot() -> dict | None:
    with GUEST_LOCK:
        return dict(GUEST_PENDING_JOB) if GUEST_PENDING_JOB else None


def abandon_host_power_ownership(item_id: str) -> None:
    """Forget a failed job without ever powering off an already-started host."""
    with GUEST_LOCK:
        HOST_STARTED_BY_ADDON_FOR.discard(str(item_id or ""))
        HOST_SHUTDOWN_PENDING_FOR.discard(str(item_id or ""))


def handle_vm_stopped_callback(payload: dict | None = None) -> bool:
    """Power off the host only for jobs whose host was started by this add-on."""
    with GUEST_LOCK:
        eligible = [
            item_id for item_id in HOST_SHUTDOWN_PENDING_FOR
            if item_id in HOST_STARTED_BY_ADDON_FOR and item_id not in HOST_POWER_OFF_COMPLETED_FOR
        ]
        if not eligible:
            print("VM-stop bevestigd, maar de host-pc was niet door de add-on gestart; pc blijft aan.", flush=True)
            return False
        for item_id in eligible:
            HOST_POWER_OFF_COMPLETED_FOR.add(item_id)
            HOST_SHUTDOWN_PENDING_FOR.discard(item_id)

    def worker() -> None:
        try:
            time.sleep(5)
            call_home_assistant_entity(PC_POWER_OFF_ENTITY)
            print(f"VM is volledig uit; {PC_POWER_OFF_ENTITY} eenmaal uitgevoerd voor add-onactie {', '.join(eligible)}.", flush=True)
        except Exception as exc:
            print(f"VM is uit, maar automatisch uitschakelen van de host mislukte; pc blijft aan: {exc}", flush=True)
        finally:
            with GUEST_LOCK:
                for item_id in eligible:
                    HOST_STARTED_BY_ADDON_FOR.discard(item_id)

    threading.Thread(target=worker, name="host-power-off-after-vm-stopped", daemon=True).start()
    return True


def stop_vm_then_host(item_id: str, reason: str = "Print bevestigd") -> None:
    item_id = str(item_id or "")
    with GUEST_LOCK:
        if item_id in POWER_OFF_REQUESTED_FOR:
            return
        POWER_OFF_REQUESTED_FOR.add(item_id)
        host_was_started_by_addon = item_id in HOST_STARTED_BY_ADDON_FOR
        if host_was_started_by_addon:
            HOST_SHUTDOWN_PENDING_FOR.add(item_id)
    try:
        call_home_assistant_entity(VM_START_ENTITY)
        print(f"{reason}; {VM_START_ENTITY} eenmaal uitgevoerd om de VM te stoppen.", flush=True)
        if host_was_started_by_addon:
            print("Host-pc is door de add-on gestart; wacht op de bevestigde VM-stopcallback voordat de pc uitgaat.", flush=True)
        else:
            print("Host-pc draaide al vóór deze add-onactie en blijft daarom aan.", flush=True)
    except Exception as exc:
        abandon_host_power_ownership(item_id)
        print(f"Automatisch uitschakelen mislukt; pc blijft veilig aan: {exc}", flush=True)


def preparation_is_active() -> bool:
    with PREPARATION_LOCK:
        return PREPARATION_ACTIVE


def start_vm_preparation(item: dict) -> None:
    global PREPARATION_ACTIVE, PREPARATION_RESULT
    with PREPARATION_LOCK:
        if PREPARATION_ACTIVE:
            raise RuntimeError("Er wordt al een printstart voorbereid")
        PREPARATION_ACTIVE = True
        PREPARATION_RESULT = None

    def worker() -> None:
        global PREPARATION_ACTIVE, PREPARATION_RESULT
        try:
            result = dispatch_to_vm_guest(item)
            outcome = {"item": item, "result": result, "error": ""}
        except Exception as exc:
            clear_guest_job(str(item.get("id") or ""))
            abandon_host_power_ownership(str(item.get("id") or ""))
            try:
                queue_request({"action": "ack", "item_id": item["id"], "status": "queued", "error": queue_retry_error(item, str(exc))})
            except Exception as queue_exc:
                print(f"Printstartfout kon niet naar de wachtrij: {queue_exc}", flush=True)
            notify_admin_manual_intervention(item, str(exc), f"prepare-{item.get('id')}-{int(time.time())}")
            outcome = {"item": item, "result": {}, "error": str(exc)}
        with PREPARATION_LOCK:
            PREPARATION_RESULT = outcome
            PREPARATION_ACTIVE = False

    threading.Thread(target=worker, name="prepare-vm-print", daemon=True).start()


def take_preparation_result() -> dict | None:
    global PREPARATION_RESULT
    with PREPARATION_LOCK:
        result = PREPARATION_RESULT
        PREPARATION_RESULT = None
        return result


class InputButtonPress:
    """Detect a new Home Assistant input_button timestamp without firing on startup."""

    def __init__(self) -> None:
        self.last_state: str | None = None

    def update(self, state: str) -> bool:
        normalized = str(state or "").strip().lower()
        if normalized in {"", "unknown", "unavailable", "none"}:
            return False
        if self.last_state is None:
            self.last_state = normalized
            return False
        if normalized == self.last_state:
            return False
        self.last_state = normalized
        return True


def normalized_print_name(value: str) -> str:
    name = Path(str(value or "").replace("\\", "/")).name.lower()
    for suffix in (".gcode.3mf", ".3mf", ".gcode"):
        if name.endswith(suffix):
            name = name[:-len(suffix)]
            break
    return re.sub(r"[^a-z0-9]+", "", name)


def selected_print_matches(item: dict, report: dict) -> bool:
    expected_values = [str(item.get("file_name") or ""), str(item.get("sd_file_path") or "")]
    observed_values = [str(report.get("subtask_name") or ""), str(report.get("gcode_file") or "")]
    expected = {normalized_print_name(value) for value in expected_values if normalized_print_name(value)}
    observed = {normalized_print_name(value) for value in observed_values if normalized_print_name(value)}
    if not expected or not observed or expected.isdisjoint(observed):
        return False
    expected_plate = int(item.get("plate_number") or 1)
    observed_text = " ".join(observed_values)
    plate_match = re.search(r"plate[_-]?(\d+)", observed_text, re.I)
    observed_plate = None
    if plate_match:
        observed_plate = int(plate_match.group(1))
    else:
        for key in ("plate_number", "plate_num"):
            try:
                observed_plate = int(report.get(key))
            except (TypeError, ValueError):
                continue
            break
        if observed_plate is None:
            try:
                observed_plate = int(report.get("plate_idx")) + 1
            except (TypeError, ValueError):
                pass
    return observed_plate == expected_plate


def queue_print_command(item: dict) -> dict:
    mapping = [int(value) for value in (item.get("ams_mapping") or [])]
    bed_leveling = bool(item.get("calibration_enabled", False))
    plate = max(1, int(item.get("plate_number") or 1))
    path = str(item.get("sd_file_path") or "").lstrip("/")
    sequence_id = next_print_sequence_id()
    if path.lower().endswith(".gcode"):
        return {"print": {
            "sequence_id": sequence_id, "command": "gcode_file",
            "param": f"/sdcard/{path}", "subtask_name": str(item.get("file_name") or Path(path).name),
            "timelapse": False, "bed_leveling": bed_leveling, "bed_levelling": bed_leveling,
            "flow_cali": False, "vibration_cali": False, "layer_inspect": False,
            "use_ams": bool(mapping), "ams_mapping": mapping,
        }}
    mapping2 = [{"ams_id": value // 4, "slot_id": value % 4} for value in mapping if value >= 0]
    return {"print": {
        "sequence_id": sequence_id,
        "command": "project_file",
        "param": f"Metadata/plate_{plate}.gcode",
        "project_id": "0", "profile_id": "0", "task_id": "0", "subtask_id": "0",
        "subtask_name": str(item.get("file_name") or Path(path).name),
        "url": f"file:///sdcard/{path}", "md5": "", "bed_type": "auto",
        "timelapse": False, "bed_leveling": bed_leveling, "bed_levelling": bed_leveling,
        "flow_cali": False, "vibration_cali": False, "layer_inspect": False,
        "auto_bed_leveling": 1 if bed_leveling else 2, "nozzle_offset_cali": 2, "extrude_cali_flag": 2,
        "cfg": "0", "job_type": 1, "plate_idx": plate - 1,
        "timestamp": int(time.time() * 1000),
        "use_ams": bool(mapping), "ams_mapping": mapping, "ams_mapping2": mapping2,
    }}


def queue_item_is_dry_run(item: dict) -> bool:
    """Recognise a safe end-to-end queue test without relying on a new DB field."""
    return bool(item.get("dry_run")) or str(item.get("bridge_error") or "").upper().startswith("DRY_RUN_PENDING")


def queue_retry_error(item: dict, error: str) -> str:
    """Keep failed dry runs recognisable so a retry can never become a real print."""
    return f"DRY_RUN_PENDING: {error}" if queue_item_is_dry_run(item) else error


def send_print_command(cloud_socket: ssl.SSLSocket, request_topic: str, report_topic: str, command: dict) -> tuple[str, dict | None]:
    """Send only through the authenticated Bambu Cloud MQTT session."""
    print("MQTT UITGAAND naar printer: " + json.dumps(command, ensure_ascii=False, separators=(",", ":")), flush=True)
    cloud_socket.sendall(publish_packet(request_topic, command))
    return "Bambu Cloud", None


def run(session: dict, serial: str) -> None:
    context = ssl.create_default_context()
    with socket.create_connection((MQTT_HOST, 8883), timeout=20) as raw, context.wrap_socket(raw, server_hostname=MQTT_HOST) as sock:
        # Allow a complete TLS/MQTT frame to arrive before treating the socket as idle.
        sock.settimeout(10)
        sock.sendall(connect_packet(f"u_{session['uid']}", session["access_token"]))
        kind, response = read_packet(sock)
        if kind >> 4 != 2 or len(response) < 2 or response[1] != 0:
            raise RuntimeError(f"Bambu Cloud MQTT-login geweigerd: {response.hex()}")
        report_topic, request_topic = f"device/{serial}/report", f"device/{serial}/request"
        sock.sendall(subscribe_packet(report_topic))
        read_packet(sock)
        sock.sendall(publish_packet(request_topic, {"pushing": {"sequence_id": "0", "command": "pushall"}}))
        print(f"Verbonden met Bambu-printer {serial}; live status wordt doorgestuurd.", flush=True)
        complete, last_ping = {}, time.monotonic()
        manual_status_pending = False
        ams_refresh_pending = False
        next_plate_button = InputButtonPress()
        fan_automation = PrintFanAutomation()
        active_item = None
        active_sequence_id = None
        active_ack_received = False
        active_runner = False
        observed_running = False
        command_sent_at = 0.0
        last_reported_state = ""
        last_website_trigger_check = 0.0
        restored = pending_guest_snapshot()
        if restored:
            restored_job = restored["payload"]["job"]
            active_item = str(restored_job["id"])
            active_sequence_id = str(restored["runner_job_id"])
            active_ack_received = True
            active_runner = True
            command_sent_at = float(restored.get("dispatched_at") or time.monotonic())
            print(
                f"Openstaande VM-agenttaak #{active_sequence_id} na cloudherverbinding hersteld; "
                "de printknop wordt niet opnieuw uitgevoerd.",
                flush=True,
            )
        while True:
            try:
                kind, payload = read_packet(sock)
            except (socket.timeout, TimeoutError, ssl.SSLWantReadError):
                kind, payload = 0, b""
            except ssl.SSLError as exc:
                if "timed out" in str(exc).lower():
                    kind, payload = 0, b""
                else:
                    raise
            if kind >> 4 == 3:
                topic_length = struct.unpack("!H", payload[:2])[0]
                data = json.loads(payload[2 + topic_length:].decode(errors="replace"))
                print_update = data.get("print") or {}
                if "result" in print_update:
                    print("MQTT INKOMENDE printer-ACK: " + json.dumps({"print": print_update}, ensure_ascii=False, separators=(",", ":")), flush=True)
                    if active_item and str(print_update.get("sequence_id") or "") == str(active_sequence_id or ""):
                        active_ack_received = True
                        result = str(print_update.get("result") or "").lower()
                        reason = str(print_update.get("reason") or print_update.get("print_error") or result)
                        if result not in {"success", "ok", "0"}:
                            queue_request({"action": "ack", "item_id": active_item, "status": "failed", "error": f"Printer wees start af: {reason}"})
                            print(f"Printer heeft startopdracht #{active_sequence_id} afgewezen: {reason}.", flush=True)
                            active_item = None
                            active_sequence_id = None
                            active_runner = False
                            command_sent_at = 0.0
                else:
                    merge(complete, print_update)
                    remember_latest_report(complete)
                    if manual_status_pending:
                        forward(status_payload(complete))
                        manual_status_pending = False
                        MANUAL_STATUS_REFRESH_COMPLETED.set()
                        print("Handmatige printer- en AMS-statusrefresh voltooid.", flush=True)
                    if ams_refresh_pending:
                        forward(ams_only_payload(complete))
                        ams_refresh_pending = False
                        AMS_REFRESH_COMPLETED.set()
                        print("Aparte AMS-refresh voltooid; overige printerdata is niet gewijzigd.", flush=True)
            # PINGRESP (type 13) is only an acknowledgement; a client must not answer it.

            now = time.monotonic()
            if MANUAL_STATUS_REFRESH_REQUESTED.is_set() and not manual_status_pending:
                sock.sendall(publish_packet(request_topic, {"pushing": {"sequence_id": next_print_sequence_id(), "command": "pushall"}}))
                MANUAL_STATUS_REFRESH_REQUESTED.clear()
                manual_status_pending = True
                print("Handmatige pushall-statusaanvraag naar de Bambu-printer verzonden.", flush=True)
            if AMS_REFRESH_REQUESTED.is_set() and not ams_refresh_pending:
                sock.sendall(publish_packet(request_topic, {"pushing": {"sequence_id": next_print_sequence_id(), "command": "pushall"}}))
                AMS_REFRESH_REQUESTED.clear()
                ams_refresh_pending = True
                print("Aparte AMS pushall-aanvraag naar de Bambu-printer verzonden.", flush=True)
            if now - last_ping >= 30:
                sock.sendall(bytes([0xC0, 0x00]))
                last_ping = now

            manual_queue_trigger = False
            website_queue_trigger = False
            website_request_id = 0
            try:
                manual_queue_trigger = next_plate_button.update(
                    home_assistant_entity_state(NEXT_PLATE_BUTTON_ENTITY)
                )
            except Exception as exc:
                print(f"Home Assistant-knop tijdelijk niet beschikbaar: {exc}", flush=True)
            if now - last_website_trigger_check >= 3:
                try:
                    trigger_config = queue_request({"action": "scan_config"})
                    website_request_id = int(trigger_config.get("print_start_request_id") or 0)
                    website_queue_trigger = website_request_id > int(trigger_config.get("print_start_completed_request_id") or 0)
                except Exception as exc:
                    print(f"Website-printverzoek tijdelijk niet leesbaar: {exc}", flush=True)
                last_website_trigger_check = now

            state = str(complete.get("gcode_state") or "IDLE").upper()
            fan_status_due, fan_command = fan_automation.tick(now, state, complete)
            if fan_status_due:
                sock.sendall(publish_packet(request_topic, {"pushing": {"sequence_id": next_print_sequence_id(), "command": "pushall"}}))
                print(f"30-seconden printcontrole aangevraagd; laatst bekende status: {state}.", flush=True)
                if fan_command:
                    send_print_command(sock, request_topic, report_topic, fan_command)
                    fan_gcode = str(fan_command.get("print", {}).get("param") or "").strip().replace("\n", "; ")
                    print(f"Automatische ventilatorinstelling verzonden: {fan_gcode}.", flush=True)
            prepared = take_preparation_result()
            if prepared:
                if prepared.get("error"):
                    print(f"Printstart voorbereiden mislukt: {prepared['error']}", flush=True)
                else:
                    prepared_item = prepared["item"]
                    prepared_result = prepared["result"]
                    active_item = str(prepared_item["id"])
                    active_sequence_id = str(prepared_result.get("runner_job_id") or f"vm-{active_item}")
                    active_ack_received = True
                    active_runner = True
                    observed_running = False
                    command_sent_at = now
                    print(
                        f"VM-agenttaak #{active_sequence_id} gereed; wacht maximaal 900 seconden op de geselecteerde printerstatus RUNNING.",
                        flush=True,
                    )
            if state != last_reported_state:
                print(f"PRINTERSTATUS: {last_reported_state or 'ONBEKEND'} -> {state}; print_error={complete.get('print_error', 0)}; fail_reason={complete.get('fail_reason', 0)}", flush=True)
                last_reported_state = state
            guest_event = take_guest_event(active_sequence_id) if active_item and active_runner else None
            if guest_event and guest_event.get("event") == "dry_run_complete":
                completed_test_item = active_item
                queue_request({"action": "ack", "item_id": completed_test_item, "status": "paused", "error": "DRY_RUN_COMPLETE"})
                clear_guest_job(completed_test_item)
                print(
                    f"Veilige wachtrijtest voor opdracht #{active_sequence_id} voltooid; "
                    "Bambu Connect is voorbereid maar er is niets naar de printer verzonden.",
                    flush=True,
                )
                threading.Thread(
                    target=stop_vm_then_host,
                    args=(completed_test_item, "Wachtrijtest voltooid"),
                    name="vm-host-power-off-dry-run",
                    daemon=True,
                ).start()
                active_item = None
                active_sequence_id = None
                active_ack_received = False
                active_runner = False
                observed_running = False
                command_sent_at = 0.0
            elif guest_event and guest_event.get("event") == "guest_failed":
                error = str(guest_event.get("error") or "VM-agent kon de print niet starten")
                failed_payload = GUEST_PENDING_JOB["payload"]["job"] if GUEST_PENDING_JOB else {"id": active_item}
                queue_request({"action": "ack", "item_id": active_item, "status": "queued", "error": queue_retry_error(failed_payload, error)})
                notify_admin_manual_intervention(failed_payload, error, str(active_sequence_id or active_item))
                clear_guest_job(active_item)
                abandon_host_power_ownership(active_item)
                print(f"VM-agentfout: {error}. Item staat weer in queued; pc blijft aan.", flush=True)
                active_item = None
                active_sequence_id = None
                active_ack_received = False
                active_runner = False
                observed_running = False
                command_sent_at = 0.0
            active_payload = GUEST_PENDING_JOB["payload"]["job"] if GUEST_PENDING_JOB else {}
            if active_item and state == "RUNNING" and not observed_running and not queue_item_is_dry_run(active_payload):
                if active_runner and not selected_print_matches(active_payload, complete):
                    error = "Printer draait, maar bestandsnaam of plaat komt niet overeen met de geselecteerde wachtrijprint."
                    queue_request({"action": "ack", "item_id": active_item, "status": "queued", "error": queue_retry_error(active_payload, error)})
                    notify_admin_manual_intervention(active_payload or {"id": active_item}, error, str(active_sequence_id or active_item))
                    clear_guest_job(active_item)
                    abandon_host_power_ownership(active_item)
                    print(error + " De pc blijft aan.", flush=True)
                    active_item = None
                    active_sequence_id = None
                    active_ack_received = False
                    active_runner = False
                    command_sent_at = 0.0
                else:
                    queue_request({"action": "ack", "item_id": active_item, "status": "printing"})
                    observed_running = True
                    print(f"Printer bevestigt de geselecteerde print als RUNNING voor opdracht #{active_sequence_id}.", flush=True)
                    if active_runner:
                        clear_guest_job(active_item)
                        threading.Thread(target=stop_vm_then_host, args=(active_item,), name="vm-host-power-off", daemon=True).start()
            elif active_item and observed_running and state in {"FINISH", "IDLE"}:
                queue_request({"action": "ack", "item_id": active_item, "status": "completed"})
                clear_guest_job(active_item)
                print("Wachtrijprint voltooid en afgevinkt.", flush=True)
                active_item = None
                active_sequence_id = None
                active_ack_received = False
                active_runner = False
                observed_running = False
                command_sent_at = 0.0
            elif active_item and not observed_running and command_sent_at and now - command_sent_at >= (900 if active_runner else 90):
                confirmation = "ACK ontvangen, maar RUNNING bleef uit" if active_ack_received else "geen ACK en geen RUNNING ontvangen"
                wait_seconds = 900 if active_runner else 90
                error = f"Printerstart niet bevestigd binnen {wait_seconds} seconden: {confirmation}; print_error={complete.get('print_error', 0)}; fail_reason={complete.get('fail_reason', 0)}."
                timeout_payload = GUEST_PENDING_JOB["payload"]["job"] if GUEST_PENDING_JOB else {"id": active_item}
                queue_request({"action": "ack", "item_id": active_item, "status": "queued", "error": queue_retry_error(timeout_payload, error)})
                notify_admin_manual_intervention(timeout_payload, error, str(active_sequence_id or active_item))
                clear_guest_job(active_item)
                abandon_host_power_ownership(active_item)
                print(error + " Item is veilig teruggezet in de wachtrij.", flush=True)
                active_item = None
                active_sequence_id = None
                active_ack_received = False
                active_runner = False
                command_sent_at = 0.0

            if not active_item and not preparation_is_active() and state in {"IDLE", "FINISH"} and (manual_queue_trigger or website_queue_trigger):
                result = queue_request({
                    "action": "next",
                    "manual_trigger": True,
                })
                item = result.get("command") if isinstance(result, dict) else None
                # Een websiteknopdruk is een unieke opdracht. Bevestig hem ook
                # wanneer de wachtrij leeg of tijdelijk geblokkeerd is, zodat
                # dezelfde request-id nooit opnieuw pc/VM-acties kan starten.
                if website_queue_trigger:
                    queue_request({"action": "ack_print_start", "request_id": website_request_id})
                if item:
                    try:
                        if GUEST_API_PORT:
                            start_vm_preparation(item)
                            if queue_item_is_dry_run(item):
                                print("Veilige wachtrijtest wordt voorbereid; de VM-agent mag geen printopdracht verzenden.", flush=True)
                            else:
                                print("Printstart wordt op de achtergrond voorbereid; Bambu Cloud blijft verbonden.", flush=True)
                            continue
                        if queue_item_is_dry_run(item):
                            raise RuntimeError("Veilige wachtrijtest vereist de VM-agent; rechtstreeks verzenden is bewust geblokkeerd")
                        command = queue_print_command(item)
                        command_channel, immediate_ack = send_print_command(sock, request_topic, report_topic, command)
                        active_item = str(item["id"])
                        active_sequence_id = str(command["print"]["sequence_id"])
                        active_ack_received = immediate_ack is not None
                        active_runner = False
                        observed_running = False
                        command_sent_at = now
                        if immediate_ack is not None and str(immediate_ack.get("result") or "").lower() not in {"success", "ok", "0"}:
                            reason = str(immediate_ack.get("reason") or immediate_ack.get("print_error") or immediate_ack.get("result"))
                            queue_request({"action": "ack", "item_id": active_item, "status": "failed", "error": f"Printer wees start af: {reason}"})
                            print(f"Printer heeft startopdracht #{active_sequence_id} afgewezen: {reason}.", flush=True)
                            active_item = None
                            active_sequence_id = None
                            active_runner = False
                            command_sent_at = 0.0
                        if active_item:
                            ack_text = "ACK ontvangen; wacht op RUNNING" if active_ack_received else "wacht op ACK of RUNNING"
                            print(f"Startopdracht via {command_channel} verzonden: {item.get('file_name')} · plaat {item.get('plate_number')}; {ack_text}.", flush=True)
                    except Exception as exc:
                        queue_request({"action": "ack", "item_id": item["id"], "status": "queued", "error": queue_retry_error(item, str(exc))})
                        clear_guest_job(str(item["id"]))
                        raise
                elif manual_queue_trigger or website_queue_trigger:
                    reason = result.get("reason", "geen beschikbaar wachtrij-item") if isinstance(result, dict) else "onbekende reactie"
                    print(f"Knop volgende plaat ontvangen, maar er is niets gestart: {reason}.", flush=True)

            # Legacy queue code below this point is no longer called. The active
            # bridge entry point is run_status_only().


def run_status_only(session: dict, serial: str) -> None:
    """Forward printer/AMS status without any print queue, PC or VM control."""
    context = ssl.create_default_context()
    with socket.create_connection((MQTT_HOST, 8883), timeout=20) as raw, context.wrap_socket(raw, server_hostname=MQTT_HOST) as sock:
        sock.settimeout(10)
        sock.sendall(connect_packet(f"u_{session['uid']}", session["access_token"]))
        kind, response = read_packet(sock)
        if kind >> 4 != 2 or len(response) < 2 or response[1] != 0:
            raise RuntimeError(f"Bambu Cloud MQTT-login geweigerd: {response.hex()}")
        report_topic, request_topic = f"device/{serial}/report", f"device/{serial}/request"
        sock.sendall(subscribe_packet(report_topic))
        read_packet(sock)
        sock.sendall(publish_packet(request_topic, {"pushing": {"sequence_id": "0", "command": "pushall"}}))
        print(f"Verbonden met Bambu-printer {serial}; printerstatus en AMS worden doorgestuurd.", flush=True)
        complete: dict = {}
        last_ping = time.monotonic()
        last_forwarded = 0.0
        last_state = ""
        ams_refresh_pending = False
        fan_automation = PrintFanAutomation()
        while True:
            try:
                kind, payload = read_packet(sock)
            except (socket.timeout, TimeoutError, ssl.SSLWantReadError):
                kind, payload = 0, b""
            except ssl.SSLError as exc:
                if "timed out" in str(exc).lower():
                    kind, payload = 0, b""
                else:
                    raise
            now = time.monotonic()
            if kind >> 4 == 3:
                topic_length = struct.unpack("!H", payload[:2])[0]
                data = json.loads(payload[2 + topic_length:].decode(errors="replace"))
                update = data.get("print") or {}
                if "result" not in update:
                    merge(complete, update)
                    remember_latest_report(complete)
                    state = str(complete.get("gcode_state") or "IDLE").upper()
                    if state != last_state or now - last_forwarded >= 30:
                        forward(status_payload(complete))
                        last_forwarded = now
                        if state != last_state:
                            print(f"PRINTERSTATUS: {last_state or 'ONBEKEND'} -> {state}.", flush=True)
                            last_state = state
                    if ams_refresh_pending:
                        forward(ams_only_payload(complete))
                        ams_refresh_pending = False
                        AMS_REFRESH_COMPLETED.set()
                        print("AMS-refresh voltooid.", flush=True)

            if AMS_REFRESH_REQUESTED.is_set() and not ams_refresh_pending:
                sock.sendall(publish_packet(request_topic, {"pushing": {"sequence_id": next_print_sequence_id(), "command": "pushall"}}))
                AMS_REFRESH_REQUESTED.clear()
                ams_refresh_pending = True
                print("AMS-status bij de printer opgevraagd.", flush=True)
            if now - last_ping >= 30:
                sock.sendall(bytes([0xC0, 0x00]))
                sock.sendall(publish_packet(request_topic, {"pushing": {"sequence_id": next_print_sequence_id(), "command": "pushall"}}))
                last_ping = now

            state = str(complete.get("gcode_state") or "IDLE").upper()
            fan_status_due, fan_command = fan_automation.tick(now, state, complete)
            if fan_status_due and fan_command:
                sock.sendall(publish_packet(request_topic, fan_command))


def main() -> None:
    unknown_arguments = [argument for argument in sys.argv[1:] if argument != "--login-only"]
    if unknown_arguments:
        raise RuntimeError(f"Onbekende optie(s): {' '.join(unknown_arguments)}")
    initialize_persistent_storage()
    save_persistent_settings()
    exchange_website_pairing()
    load_saved_bridge_token()
    # Only login, AMS refresh and colour-catalog controls remain. Print queue,
    # SD/FTPS scanning, host-PC control and VM control have been removed.
    threading.Thread(target=bambu_login_request_loop, name="bambu-login-requests", daemon=True).start()
    threading.Thread(target=bridge_control_loop, name="ams-refresh-requests", daemon=True).start()
    threading.Thread(target=bambu_color_catalog_loop, name="bambu-color-catalog", daemon=True).start()
    while True:
        try:
            session = login()
            break
        except Exception as exc:
            print(
                f"Bambu Cloud-login tijdelijk niet beschikbaar: {exc}. "
                "Website- en loginverzoeken blijven actief; nieuwe poging over 30 seconden.",
                flush=True,
            )
            time.sleep(30)
    save_persistent_settings()
    if "--login-only" in sys.argv[1:]:
        print(f"Bambu-sessie voor {session['account']} is veilig in het Docker-volume opgeslagen.", flush=True)
        return
    serial = choose_serial(session["access_token"])
    threading.Thread(target=cloud_presence_loop, args=(session["access_token"], serial), name="bambu-cloud-presence", daemon=True).start()
    while True:
        try:
            run_status_only(session, serial)
        except BridgeAuthorizationError as exc:
            print(f"Cloudbridge-koppeling geweigerd: {exc}", flush=True)
            time.sleep(30)
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
