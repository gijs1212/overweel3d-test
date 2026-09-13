"""Kies willekeurig een SD-kaartbestand en verzend het via Bambu Connect.

Dit script is uitsluitend bedoeld voor een handmatige test in de Windows-VM.
Het vraagt altijd om een duidelijke bevestiging, tenzij --yes is meegegeven.
"""
from __future__ import annotations

import argparse
import json
import logging
import posixpath
import random
import re
import ssl
import tempfile
import time
from pathlib import Path

from bambu_vm_guest import ImplicitFTP_TLS, addon_request, automate_bambu_connect, temporary_sd_download


ROOT = Path(__file__).resolve().parent
LOG = logging.getLogger("overweel3d-random-print-test")
PRINT_SUFFIXES = (".gcode.3mf", ".gcode", ".3mf")


def connect_ftps(printer: dict) -> ImplicitFTP_TLS:
    ftp = ImplicitFTP_TLS(timeout=45, context=ssl._create_unverified_context())
    ftp.connect(str(printer["host"]), int(printer.get("ftps_port") or 990))
    ftp.login(str(printer.get("ftps_username") or "bblp"), str(printer["access_code"]))
    ftp.prot_p()
    return ftp


def directory_entries(ftp: ImplicitFTP_TLS, directory: str) -> list[tuple[str, bool]]:
    previous = ftp.pwd()
    lines: list[str] = []
    try:
        ftp.cwd(directory)
        ftp.dir(lines.append)
    finally:
        ftp.cwd(previous)
    entries: list[tuple[str, bool]] = []
    for line in lines:
        parts = line.split(maxsplit=8)
        if len(parts) < 9:
            continue
        name = parts[-1].strip()
        if not name or name in {".", ".."}:
            continue
        is_directory = parts[0].startswith("d") or ("0" in parts[1:-1] and "." not in name)
        entries.append((name, is_directory))
    return entries


def scan_print_files(ftp: ImplicitFTP_TLS, roots: list[str], max_directories: int = 1000) -> list[str]:
    pending = ["/" + str(root or "/").strip().strip("/") for root in roots]
    pending = ["/" if path == "//" else path for path in pending]
    visited: set[str] = set()
    files: set[str] = set()
    while pending:
        directory = pending.pop(0)
        if directory in visited:
            continue
        if len(visited) >= max_directories:
            raise RuntimeError(f"Scan afgebroken na {max_directories} mappen")
        visited.add(directory)
        LOG.info("Scant FTPS-map %s", directory)
        try:
            entries = directory_entries(ftp, directory)
        except Exception as exc:
            LOG.warning("Map %s overgeslagen: %s", directory, exc)
            continue
        for name, is_directory in entries:
            path = posixpath.normpath(posixpath.join(directory, name))
            if not path.startswith("/"):
                path = "/" + path
            if is_directory:
                if path not in visited:
                    pending.append(path)
            elif name.lower().endswith(PRINT_SUFFIXES):
                files.add(path)
    return sorted(files, key=str.casefold)


def plate_number(path: str) -> int:
    match = re.search(r"plate[_-]?(\d+)", Path(path).name, re.I)
    return int(match.group(1)) if match else 1


def parse_mapping(value: str, fallback: list[int]) -> list[int]:
    if not value.strip():
        return fallback
    return [int(part.strip()) for part in value.split(",") if part.strip()]


def main() -> int:
    parser = argparse.ArgumentParser(description="Overweel3D willekeurige Bambu Connect-printtest 2.3.2")
    parser.add_argument("--config", default=str(ROOT / "vm-guest.json"))
    parser.add_argument("--root", action="append", dest="roots", help="FTPS-startmap; mag vaker worden opgegeven")
    parser.add_argument("--search", default="", help="Beperk willekeurige keuze tot namen met deze tekst")
    parser.add_argument("--ams", default="", help="Nulgebaseerde AMS-slots, bijvoorbeeld 0,1")
    parser.add_argument("--yes", action="store_true", help="Sla de interactieve PRINT-bevestiging over")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[logging.FileHandler(ROOT / "random-vm-print-test.log", encoding="utf-8"), logging.StreamHandler()],
    )
    config = json.loads(Path(args.config).read_text(encoding="utf-8"))
    addon_url = str(config.get("addon_url") or "").strip()
    addon_token = str(config.get("addon_token") or "").strip()
    if not addon_url or not addon_token:
        raise RuntimeError("vm-guest.json mist addon_url of addon_token")

    printer = addon_request(addon_url, addon_token, "/guest/printer")
    if not printer.get("host") or not printer.get("access_code"):
        raise RuntimeError("De add-on heeft nog geen lokaal printer-IP of toegangscode ontvangen")
    roots = args.roots or list(config.get("test_scan_roots") or ["/cache", "/"])
    ftp = connect_ftps(printer)
    try:
        candidates = scan_print_files(ftp, roots)
    finally:
        try:
            ftp.quit()
        except Exception:
            ftp.close()
    if args.search:
        candidates = [path for path in candidates if args.search.casefold() in path.casefold()]
    if not candidates:
        roots_text = ", ".join(roots)
        raise RuntimeError(f"Geen printbestanden gevonden in {roots_text}")

    selected = random.SystemRandom().choice(candidates)
    selected_plate = plate_number(selected)
    mapping = parse_mapping(args.ams, [int(value) for value in config.get("test_ams_mapping") or []])
    print("\nWillekeurig gekozen testprint:")
    print(f"  Bestand: {selected}")
    print(f"  Plaat:   {selected_plate}")
    print(f"  AMS:     {mapping if mapping else 'automatische/huidige keuze in Bambu Connect'}")
    print(f"  Keuze uit {len(candidates)} gevonden printbestand(en).")
    if not args.yes and input("\nTyp PRINT om dit bestand echt naar de printer te sturen: ").strip() != "PRINT":
        print("Geannuleerd; er is niets naar de printer gestuurd.")
        return 2

    job = {
        "file_name": Path(selected).name,
        "sd_file_path": selected,
        "plate_number": selected_plate,
        "ams_mapping": mapping,
        "calibration_enabled": False,
    }
    with tempfile.TemporaryDirectory(prefix="overweel3d-random-print-") as temporary:
        local_file = Path(temporary) / Path(selected).name
        temporary_sd_download(printer, selected, local_file)
        LOG.info("Tijdelijk gedownload: %s (%s bytes)", local_file, local_file.stat().st_size)
        automate_bambu_connect(local_file, job, config)
        time.sleep(max(0, int(config.get("keep_download_seconds") or 120)))
    print("De opdracht is via Bambu Connect verzonden. Controleer de printerstatus op de printer of website.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
