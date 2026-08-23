"""Dependency-free local Bambu Lab P1S status bridge.

Reads the P1S Developer Mode MQTT stream over TLS and forwards a normalized,
read-only status snapshot to Overweel3D. It never accepts commands from the site.
"""
from __future__ import annotations

import json, os, re, socket, ssl, struct, time, urllib.request

HOST = os.environ["BAMBU_HOST"]
ACCESS_CODE = os.environ["BAMBU_ACCESS_CODE"]
SERIAL = os.environ["BAMBU_SERIAL"]
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
PRINTER_ID = os.environ["OVERWEEL_PRINTER_ID"]
BRIDGE_TOKEN = os.environ["OVERWEEL_BRIDGE_TOKEN"]

def enc(value: str) -> bytes:
    raw = value.encode(); return struct.pack("!H", len(raw)) + raw

def remaining_length(value: int) -> bytes:
    result = bytearray()
    while True:
        digit = value % 128; value //= 128
        if value: digit |= 128
        result.append(digit)
        if not value: return bytes(result)

def packet(kind: int, payload: bytes) -> bytes:
    return bytes([kind]) + remaining_length(len(payload)) + payload

def connect_packet() -> bytes:
    variable = enc("MQTT") + bytes([4, 0xC2]) + struct.pack("!H", 60)
    payload = enc(f"overweel3d-{int(time.time())}") + enc("bblp") + enc(ACCESS_CODE)
    return packet(0x10, variable + payload)

def subscribe_packet(topic: str, packet_id: int = 1) -> bytes:
    return packet(0x82, struct.pack("!H", packet_id) + enc(topic) + bytes([0]))

def publish_packet(topic: str, data: dict) -> bytes:
    return packet(0x30, enc(topic) + json.dumps(data, separators=(",", ":")).encode())

def read_packet(sock: ssl.SSLSocket) -> tuple[int, bytes]:
    first = sock.recv(1)
    if not first: raise ConnectionError("Printer heeft de verbinding gesloten")
    multiplier, length = 1, 0
    while True:
        digit = sock.recv(1)[0]; length += (digit & 127) * multiplier
        if not digit & 128: break
        multiplier *= 128
    payload = bytearray()
    while len(payload) < length:
        chunk = sock.recv(length - len(payload))
        if not chunk: raise ConnectionError("Onvolledig MQTT-pakket")
        payload.extend(chunk)
    return first[0], bytes(payload)

def merge(target: dict, patch: dict) -> dict:
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(target.get(key), dict): merge(target[key], value)
        else: target[key] = value
    return target

def status_payload(report: dict) -> dict:
    state = str(report.get("gcode_state", "IDLE")).upper()
    status = {"RUNNING": "printing", "PAUSE": "paused", "FAILED": "error", "FINISH": "idle", "IDLE": "idle"}.get(state, "idle")
    gcode_file = str(report.get("gcode_file") or "")
    current_file = report.get("subtask_name") or gcode_file
    plate_match = re.search(r"plate[_-]?(\d+)", gcode_file, re.I) or re.search(r"plate[_-]?(\d+)", str(current_file), re.I)
    slots = []
    for unit_index, unit in enumerate((report.get("ams") or {}).get("ams", []) or []):
        for slot_index, tray in enumerate(unit.get("tray", []) or []):
            raw_color = str(tray.get("tray_color") or "808080").lstrip("#")
            remain = tray.get("remain")
            slots.append({"ams_unit": unit_index, "slot_number": slot_index + 1, "material": tray.get("tray_type"),
                "color_name": tray.get("tray_sub_brands") or tray.get("tray_type"), "color_hex": "#" + raw_color[:6],
                "tray_uuid": tray.get("tray_uuid"), "remaining_percent": float(remain) if remain not in (None, "") else None,
                "spool_capacity_grams": 1000, "raw_status": tray})
    return {"status": status, "print_state": state, "current_file": current_file,
        "current_plate": int(plate_match.group(1)) if plate_match else None, "progress": report.get("mc_percent", 0),
        "remaining_minutes": report.get("mc_remaining_time"), "current_layer": report.get("layer_num"),
        "total_layers": report.get("total_layer_num"), "nozzle_temperature": report.get("nozzle_temper"),
        "bed_temperature": report.get("bed_temper"), "chamber_temperature": report.get("chamber_temper"),
        "ams_slots": slots, "raw_status": report}

def forward(payload: dict) -> None:
    request = urllib.request.Request(SUPABASE_URL + "/functions/v1/printer-status-ingest",
        data=json.dumps(payload).encode(), method="POST", headers={"content-type": "application/json",
        "x-printer-id": PRINTER_ID, "x-bridge-token": BRIDGE_TOKEN})
    with urllib.request.urlopen(request, timeout=10) as response:
        if response.status >= 300: raise RuntimeError(response.read().decode())

def run() -> None:
    context = ssl.create_default_context(); context.check_hostname = False; context.verify_mode = ssl.CERT_NONE
    with socket.create_connection((HOST, 8883), timeout=15) as raw, context.wrap_socket(raw, server_hostname=HOST) as sock:
        sock.settimeout(75); sock.sendall(connect_packet()); read_packet(sock)
        report_topic, request_topic = f"device/{SERIAL}/report", f"device/{SERIAL}/request"
        sock.sendall(subscribe_packet(report_topic)); read_packet(sock)
        sock.sendall(publish_packet(request_topic, {"pushing": {"sequence_id": "0", "command": "pushall"}}))
        complete, last_sent = {}, 0.0
        while True:
            kind, payload = read_packet(sock)
            if kind >> 4 == 3:
                topic_length = struct.unpack("!H", payload[:2])[0]; message = payload[2 + topic_length:]
                data = json.loads(message.decode(errors="replace")); patch = data.get("print") or {}
                merge(complete, patch)
                if time.time() - last_sent >= 2:
                    forward(status_payload(complete)); last_sent = time.time()
            elif kind >> 4 == 13:
                sock.sendall(bytes([0xD0, 0x00]))

if __name__ == "__main__":
    while True:
        try: run()
        except Exception as exc:
            print(f"Bridge opnieuw verbinden na fout: {exc}", flush=True); time.sleep(5)
