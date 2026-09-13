"""Runs inside the Windows VM and talks directly to the Home Assistant add-on."""
from __future__ import annotations

import argparse
import ftplib
import json
import logging
import os
import re
import socket
import ssl
import tempfile
import time
import urllib.parse
import urllib.request
from pathlib import Path

from pywinauto import Desktop

ROOT = Path(__file__).resolve().parent
LOG = logging.getLogger("overweel3d-vm-guest")
VM_AGENT_VERSION = "2.3.2"


class ImplicitFTP_TLS(ftplib.FTP_TLS):
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


def addon_request(url: str, token: str, path: str, payload: dict | None = None) -> dict:
    data = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(
        url.rstrip("/") + path,
        data=data,
        method="POST" if data is not None else "GET",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode() or "{}")


def temporary_sd_download(printer: dict, remote_path: str, destination: Path) -> None:
    context = ssl._create_unverified_context()
    ftp = ImplicitFTP_TLS(timeout=45, context=context)
    try:
        ftp.connect(str(printer["host"]), int(printer.get("ftps_port") or 990))
        ftp.login(str(printer.get("ftps_username") or "bblp"), str(printer["access_code"]))
        ftp.prot_p()
        with destination.open("wb") as output:
            ftp.retrbinary("RETR /" + remote_path.lstrip("/"), output.write, blocksize=256 * 1024)
    finally:
        try:
            ftp.quit()
        except ftplib.all_errors:
            ftp.close()


def configured_control(window, selector: dict):
    auto_id = str(selector.get("auto_id") or "")
    title_re = str(selector.get("title_re") or "")
    control_type = str(selector.get("control_type") or "")
    found_index = int(selector.get("found_index") or 0)
    kwargs: dict[str, object] = {"found_index": found_index}
    if auto_id:
        kwargs["auto_id"] = auto_id
    elif title_re:
        kwargs["title_re"] = title_re
    else:
        raise RuntimeError("UI-selector mist auto_id of title_re")
    if control_type:
        kwargs["control_type"] = control_type
    return window.child_window(**kwargs)


def control_key(control) -> tuple:
    info = control.element_info
    runtime_id = getattr(info, "runtime_id", None)
    if runtime_id:
        return tuple(runtime_id)
    rectangle = control.rectangle()
    return (
        getattr(info, "control_type", ""),
        rectangle.left,
        rectangle.top,
        rectangle.right,
        rectangle.bottom,
    )


def control_text(control) -> str:
    try:
        return str(control.window_text() or "").strip()
    except Exception:
        return ""


def available_controls(window, control_type: str) -> list:
    result = []
    for control in window.descendants(control_type=control_type):
        try:
            if control.is_visible() and control.is_enabled():
                result.append(control)
        except Exception:
            continue
    return result


def combo_items(control) -> list[str]:
    try:
        return [str(value).strip() for value in control.item_texts() if str(value).strip()]
    except Exception:
        return []


def combo_contains_value(control, value: str) -> bool:
    wanted = value.casefold().strip()
    current = control_text(control).casefold()
    if wanted == current or (wanted and wanted in current):
        return True
    return any(wanted == item.casefold() or wanted in item.casefold() for item in combo_items(control))


def select_combo_control(control, value: str) -> None:
    control.wait("enabled", timeout=20)
    try:
        control.select(value)
    except Exception:
        control.click_input()
        control.type_keys("^a" + value + "{ENTER}", with_spaces=True)


def set_checkbox_state(control, enabled: bool, label: str) -> None:
    control.wait("enabled", timeout=20)
    current = bool(control.get_toggle_state())
    if current != enabled:
        control.click_input()
    LOG.info("Bambu Connect-optie automatisch ingesteld: %s = %s", label, "aan" if enabled else "uit")


def autodetect_printer_combo(window, printer_name: str):
    combos = available_controls(window, "ComboBox")
    matching = [control for control in combos if combo_contains_value(control, printer_name)]
    if not matching:
        # Connect kan een gekoppelde printer als tekst tonen wanneer er maar één
        # printer bestaat. In dat geval is kiezen niet nodig.
        page_text = " ".join(control_text(control) for control in window.descendants()).casefold()
        if printer_name.casefold() in page_text:
            LOG.info("Bambu Connect toont printer %s al als geselecteerd", printer_name)
            return None
        raise RuntimeError(f"Bambu Connect bevat geen printerkeuze voor {printer_name!r}")
    control = matching[0]
    select_combo_control(control, printer_name)
    LOG.info("Printer automatisch herkend en geselecteerd: %s", printer_name)
    return control


def autodetect_ams_combos(window, count: int, excluded: set[tuple]) -> list:
    candidates = []
    for control in available_controls(window, "ComboBox"):
        if control_key(control) in excluded:
            continue
        text = " ".join([control_text(control), *combo_items(control)]).casefold()
        # Filamentmapping bevat doorgaans AMS/filament/slot of meerdere
        # numerieke slotkeuzes. Andere keuzelijsten krijgen daardoor geen score.
        score = 0
        if "ams" in text:
            score += 50
        if "filament" in text or "materiaal" in text or "material" in text:
            score += 40
        numeric_choices = sum(1 for item in combo_items(control) if re.search(r"\b(?:[1-9]|1[0-6])\b", item))
        score += min(numeric_choices, 16) * 3
        if score:
            rectangle = control.rectangle()
            candidates.append((score, rectangle.top, rectangle.left, control))
    candidates.sort(key=lambda item: (-item[0], item[1], item[2]))
    selected = [item[3] for item in candidates[:count]]
    selected.sort(key=lambda control: (control.rectangle().top, control.rectangle().left))
    if len(selected) < count:
        raise RuntimeError(f"Bambu Connect toont {len(selected)} automatische AMS-keuze(s), maar {count} zijn nodig")
    return selected


def find_action_button(window, patterns: list[str]):
    matches = []
    for control in available_controls(window, "Button"):
        title = control_text(control)
        for priority, pattern in enumerate(patterns):
            if re.search(pattern, title, flags=re.IGNORECASE):
                rectangle = control.rectangle()
                matches.append((priority, -rectangle.top, -rectangle.left, control))
                break
    if not matches:
        raise RuntimeError(f"Bambu Connect-knop niet automatisch gevonden: {' / '.join(patterns)}")
    matches.sort(key=lambda item: (item[0], item[1], item[2]))
    return matches[0][3]


def click_action_automatically(window, kind: str) -> None:
    patterns = {
        "send": [
            r"^(print|afdrukken)$",
            r"^(send|verzenden)( to printer| naar printer)?$",
            r"^(start print|print starten)$",
        ],
        "confirm": [
            r"^(confirm|bevestigen|ok)$",
            r"^(print|afdrukken|start print|print starten)$",
            r"^(send|verzenden)$",
        ],
    }[kind]
    button = find_action_button(window, patterns)
    LOG.info("Bambu Connect-knop automatisch herkend: %s", control_text(button))
    button.click_input()


def find_connect_window_with_action(title_re: str, kind: str, original_window=None):
    windows = []
    original_key = control_key(original_window) if original_window is not None else None
    for candidate in Desktop(backend="uia").windows():
        try:
            if not candidate.is_visible() or not re.search(title_re, control_text(candidate), flags=re.IGNORECASE):
                continue
            # Een nieuw/actief bevestigingsvenster gaat vóór het oorspronkelijke
            # verzendvenster, zodat de verzendknop nooit tweemaal wordt gebruikt.
            score = 0
            if candidate.is_active():
                score += 20
            if original_key is not None and control_key(candidate) != original_key:
                score += 10
            find_action_button(
                candidate,
                {
                    "send": [r"^(print|afdrukken)$", r"^(send|verzenden)( to printer| naar printer)?$"],
                    "confirm": [r"^(confirm|bevestigen|ok)$", r"^(print|afdrukken|start print|print starten)$"],
                }[kind],
            )
            windows.append((score, candidate))
        except Exception:
            continue
    if not windows:
        raise RuntimeError(f"Geen zichtbaar Bambu Connect-venster met {kind}-knop gevonden")
    windows.sort(key=lambda item: -item[0])
    return windows[0][1]


def click_configured(window, config: dict, name: str) -> None:
    selector = config.get(name) or {}
    coordinates = selector.get("coordinates")
    if selector.get("auto_id") or selector.get("title_re"):
        control = configured_control(window, selector)
        control.wait("enabled", timeout=20)
        control.click_input()
        return
    if isinstance(coordinates, list) and len(coordinates) == 2:
        window.click_input(coords=(int(coordinates[0]), int(coordinates[1])))
        return
    raise RuntimeError(f"Geen veilige UI-selector ingesteld voor {name}")


def select_combo(window, selector: dict, value: str) -> None:
    control = configured_control(window, selector)
    select_combo_control(control, value)


def build_bambu_connect_import_url(file_path: Path, display_name: str | None = None) -> str:
    """Build the URL documented by Bambu Lab for importing a local print file."""
    absolute_path = file_path.expanduser().resolve()
    if not absolute_path.is_file():
        raise FileNotFoundError(f"Printbestand bestaat niet: {absolute_path}")
    if not (absolute_path.name.lower().endswith(".3mf") or absolute_path.name.lower().endswith(".gcode")):
        raise RuntimeError("Bambu Connect accepteert via deze route alleen 3MF- en Bambu G-codebestanden")
    query = urllib.parse.urlencode(
        {
            "path": str(absolute_path),
            "name": display_name or absolute_path.name,
            "version": "1.0.0",
        },
        quote_via=urllib.parse.quote,
        safe="",
    )
    return "bambu-connect://import-file?" + query


def log_connect_controls(window) -> None:
    """Write UI Automation selectors to the VM log without interrupting the job."""
    try:
        controls: list[str] = []
        for index, control in enumerate(window.descendants()):
            if index >= 250:
                controls.append("... meer dan 250 elementen; uitvoer afgekapt")
                break
            info = control.element_info
            title = str(getattr(info, "name", "") or "").replace("\n", " ")
            auto_id = str(getattr(info, "automation_id", "") or "")
            control_type = str(getattr(info, "control_type", "") or "")
            if title or auto_id:
                controls.append(f"type={control_type!r} auto_id={auto_id!r} title={title!r}")
        LOG.error("Bambu Connect UI-elementen:\n%s", "\n".join(controls) or "(geen elementen gevonden)")
    except Exception as exc:
        LOG.warning("UI-elementen konden niet worden uitgelezen: %s", exc)


def automate_bambu_connect(file_path: Path, job: dict, config: dict) -> None:
    import_url = build_bambu_connect_import_url(file_path)
    LOG.info("Opent lokaal bestand via de officiële Bambu Connect import-file-koppeling: %s", file_path.name)
    os.startfile(import_url)
    title_re = str(config.get("window_title_regex") or ".*Bambu Connect.*")
    window = Desktop(backend="uia").window(title_re=title_re)
    window.wait("visible", timeout=int(config.get("ui_timeout_seconds") or 120))
    window.set_focus()
    # De protocolhandler opent Connect direct, maar het inlezen van een groot 3MF
    # gaat asynchroon. Wacht dus voordat selectors of knoppen worden gebruikt.
    time.sleep(max(1, int(config.get("import_settle_seconds") or 8)))

    try:
        automatic = bool(config.get("automatic_ui_detection", True))
        excluded_combos: set[tuple] = set()
        printer_name = str(config.get("printer_name") or "").strip()
        if printer_name:
            if automatic:
                try:
                    printer_combo = autodetect_printer_combo(window, printer_name)
                    if printer_combo is not None:
                        excluded_combos.add(control_key(printer_combo))
                except Exception as exc:
                    LOG.warning("Automatische printerherkenning gebruikt selectorfallback: %s", exc)
                    select_combo(window, config.get("printer_combobox") or {}, printer_name)
            else:
                select_combo(window, config.get("printer_combobox") or {}, printer_name)

        mapping = [int(slot) for slot in (job.get("ams_mapping") or [])]
        selectors = config.get("ams_comboboxes") or []
        if mapping:
            automatic_combos = None
            if automatic:
                try:
                    automatic_combos = autodetect_ams_combos(window, len(mapping), excluded_combos)
                    LOG.info("%s AMS-keuze(s) automatisch herkend", len(automatic_combos))
                except Exception as exc:
                    LOG.warning("Automatische AMS-herkenning gebruikt selectorfallback: %s", exc)
            if automatic_combos is not None:
                for index, slot in enumerate(mapping):
                    select_combo_control(automatic_combos[index], str(slot + 1))
            else:
                if len(selectors) < len(mapping):
                    raise RuntimeError(f"Voor {len(mapping)} kleuren zijn slechts {len(selectors)} AMS-selectors ingesteld")
                for index, slot in enumerate(mapping):
                    # Website-AMS-slots zijn nulgebaseerd; de UI toont doorgaans 1..16.
                    select_combo(window, selectors[index], str(slot + 1))

        if bool(config.get("disable_calibration", True)):
            bed_leveling = bool(job.get("calibration_enabled", False))
            handled_keys: set[tuple] = set()
            bed_control_found = False
            if automatic:
                for control in available_controls(window, "CheckBox"):
                    title = control_text(control)
                    if re.search(r"bed.?level|bed.?nivell", title, flags=re.IGNORECASE):
                        handled_keys.add(control_key(control))
                        bed_control_found = True
                        set_checkbox_state(control, bed_leveling, title or "bed-leveling")
                    elif re.search(r"flow.?calibr|flow.?dynam|vibrat|nozzle.?offset|extrud|kalibr", title, flags=re.IGNORECASE):
                        handled_keys.add(control_key(control))
                        set_checkbox_state(control, False, title or "overige kalibratie")
            if not bed_control_found:
                try:
                    control = configured_control(window, config.get("bed_leveling_checkbox") or {})
                    set_checkbox_state(control, bed_leveling, "bed-leveling")
                    handled_keys.add(control_key(control))
                    bed_control_found = True
                except Exception as exc:
                    if bed_leveling:
                        raise RuntimeError("Bed-leveling is gevraagd, maar de optie is niet automatisch gevonden") from exc
                    LOG.info("Geen bed-levelingoptie gevonden; de standaard blijft uit")
            for selector in config.get("other_calibration_checkboxes") or []:
                try:
                    control = configured_control(window, selector)
                    if control_key(control) not in handled_keys and control.exists(timeout=1):
                        set_checkbox_state(control, False, control_text(control) or "overige kalibratie")
                except Exception:
                    if not automatic:
                        raise

        if automatic:
            try:
                click_action_automatically(window, "send")
            except Exception as exc:
                LOG.warning("Automatische verzendknopherkenning gebruikt selectorfallback: %s", exc)
                click_configured(window, config, "send_button")
        else:
            click_configured(window, config, "send_button")
        confirm = config.get("confirm_button") or {}
        if automatic or confirm:
            time.sleep(max(1, int(config.get("confirm_settle_seconds") or 2)))
            # De bevestiging kan in hetzelfde of in een nieuw Connect-venster staan.
            if automatic:
                try:
                    confirm_window = find_connect_window_with_action(title_re, "confirm", original_window=window)
                    click_action_automatically(confirm_window, "confirm")
                except Exception as exc:
                    if confirm:
                        LOG.warning("Automatische bevestigingsknopherkenning gebruikt selectorfallback: %s", exc)
                        confirm_window = Desktop(backend="uia").window(title_re=title_re)
                        confirm_window.wait("visible", timeout=20)
                        click_configured(confirm_window, config, "confirm_button")
                    else:
                        raise
            else:
                confirm_window = Desktop(backend="uia").window(title_re=title_re)
                confirm_window.wait("visible", timeout=20)
                click_configured(confirm_window, config, "confirm_button")
    except Exception:
        log_connect_controls(window)
        raise
    LOG.info("Officiële Bambu Connect-UI heeft de printopdracht ontvangen")


def process_job(addon_url: str, addon_token: str, job_id: str, config: dict) -> bool:
    try:
        payload = addon_request(
            addon_url,
            addon_token,
            "/guest/job?" + urllib.parse.urlencode({"job_id": job_id}),
        )
        job = payload["job"]
        printer = payload["printer"]
        remote_path = str(job.get("sd_file_path") or "").strip()
        if not remote_path:
            raise RuntimeError("Wachtrij-item bevat geen SD-kaartpad")
        addon_request(addon_url, addon_token, "/guest/event", {"event": "downloading", "job_id": job_id})
        with tempfile.TemporaryDirectory(prefix="overweel3d-vm-print-") as temporary:
            local_file = Path(temporary) / Path(remote_path.replace("\\", "/")).name
            temporary_sd_download(printer, remote_path, local_file)
            LOG.info("FTPS-bestand gedownload: %s (%s bytes)", local_file.name, local_file.stat().st_size)
            addon_request(addon_url, addon_token, "/guest/event", {"event": "automating_bambu_connect", "job_id": job_id})
            automate_bambu_connect(local_file, job, config)
            addon_request(addon_url, addon_token, "/guest/event", {"event": "waiting_for_printer_confirmation", "job_id": job_id})
            # Houd de tijdelijke 3MF beschikbaar terwijl Bambu Connect hem verwerkt.
            time.sleep(int(config.get("keep_download_seconds") or 120))
        return True
    except Exception as exc:
        LOG.exception("VM-gasttaak mislukt")
        try:
            addon_request(addon_url, addon_token, "/guest/event", {"event": "guest_failed", "job_id": job_id, "error": str(exc)})
        except Exception:
            pass
        return False


def run_startup_agent(config: dict) -> int:
    addon_url = str(config.get("addon_url") or "").strip()
    addon_token = str(config.get("addon_token") or "").strip()
    if not addon_url or not addon_token:
        raise RuntimeError("vm-guest.json mist addon_url of addon_token")
    poll_seconds = max(2, int(config.get("poll_seconds") or 3))
    handled_jobs: set[str] = set()
    LOG.info("VM-agent %s actief; meldt zich rechtstreeks bij de Home Assistant-add-on", VM_AGENT_VERSION)
    while True:
        try:
            response = addon_request(
                addon_url,
                addon_token,
                "/guest/ready",
                {"version": VM_AGENT_VERSION, "state": "ready"},
            )
            job_id = str(response.get("runner_job_id") or "")
            if job_id and job_id not in handled_jobs:
                handled_jobs.add(job_id)
                LOG.info("Wachtrijtaak %s ontvangen; Bambu Connect-verwerking begint", job_id)
                process_job(addon_url, addon_token, job_id, config)
        except Exception as exc:
            LOG.warning("VM-agent kan de Home Assistant-add-on tijdelijk niet bereiken: %s", exc)
        time.sleep(poll_seconds)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--addon-url")
    parser.add_argument("--addon-token")
    parser.add_argument("--job-id")
    parser.add_argument("--agent", action="store_true")
    parser.add_argument("--config", default=str(ROOT / "vm-guest.json"))
    args = parser.parse_args()
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[logging.FileHandler(ROOT / "vm-guest.log", encoding="utf-8"), logging.StreamHandler()],
    )
    config = json.loads(Path(args.config).read_text(encoding="utf-8"))
    if args.addon_url:
        config["addon_url"] = args.addon_url
    if args.addon_token:
        config["addon_token"] = args.addon_token
    if args.agent:
        return run_startup_agent(config)
    if not args.addon_url or not args.addon_token or not args.job_id:
        parser.error("Gebruik --agent of geef --addon-url, --addon-token en --job-id op")
    return 0 if process_job(args.addon_url, args.addon_token, args.job_id, config) else 1


if __name__ == "__main__":
    raise SystemExit(main())
