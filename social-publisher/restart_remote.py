"""Restart the existing Social Publisher using the user's SSH launcher credentials.

This helper never prints or persists the credentials from the launcher.
"""

from __future__ import annotations

import ast
import re
import sys
import time
from pathlib import Path

import paramiko


LAUNCHER = Path(r"C:\Users\gijso\Downloads\start_social_publisher.py")
RESTART_COMMAND = (
    "cd /mnt/truenas-data/docker/social-publisher && "
    "docker compose --env-file .env restart social-publisher"
)
CHECK_META_COMMAND = (
    "cd /mnt/truenas-data/docker/social-publisher && "
    "docker compose --env-file .env exec -T social-publisher "
    "python -c 'import asyncio; "
    "from app.meta_config import load_meta_config; "
    "from app.meta_api import MetaGraphClient; "
    "load_meta_config(); "
    "print(asyncio.run(MetaGraphClient().check_accounts()))'"
)
LOG_COMMAND = (
    "cd /mnt/truenas-data/docker/social-publisher && "
    "docker compose --env-file .env logs --no-color --tail=80 social-publisher"
)
HEALTH_COMMAND = "curl -sS https://api.gijsoverweel.nl/api/overweel3d/health"
META_READY_COMMAND = (
    "cd /mnt/truenas-data/docker/social-publisher && "
    "docker compose --env-file .env exec -T social-publisher "
    "python -c 'from app.meta_config import load_meta_config; "
    "from app.meta_api import MetaGraphClient; load_meta_config(); "
    "print(\"meta_ready=\", MetaGraphClient().configured)'"
)
DEBUG_POLL_COMMAND = (
    "cd /mnt/truenas-data/docker/social-publisher && "
    "docker compose --env-file .env exec -T social-publisher "
    "python -c 'import asyncio; from app.pocketbase import PocketBaseSocialClient; "
    "print(asyncio.run(PocketBaseSocialClient().action(\"poll\", "
    "{\"version\":\"2.6.0\",\"meta_ready\":True,\"diagnose\":True})))'"
)


def launcher_settings() -> dict[str, str]:
    tree = ast.parse(LAUNCHER.read_text(encoding="utf-8"))
    wanted = {"HOST", "USER", "SSH_PASSWORD", "ROOT_PASSWORD"}
    values: dict[str, str] = {}
    for node in tree.body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1:
            target = node.targets[0]
            if isinstance(target, ast.Name) and target.id in wanted:
                values[target.id] = ast.literal_eval(node.value)
    if set(values) != wanted:
        raise RuntimeError("De bestaande SSH-launcher mist verbindingsgegevens.")
    return values


def read_until(channel: paramiko.Channel, pattern: str, timeout: int = 30) -> str:
    deadline = time.monotonic() + timeout
    output = ""
    while time.monotonic() < deadline:
        if channel.recv_ready():
            output += channel.recv(8192).decode("utf-8", errors="replace")
            if re.search(pattern, output, re.I):
                return output
        if channel.closed:
            break
        time.sleep(0.1)
    preview = re.sub(r"EA[A-Za-z0-9]{20,}", "<verborgen>", output[-1500:])
    raise TimeoutError(f"Geen bevestiging van de remote shell ({pattern}). Laatste output: {preview}")


def main() -> int:
    check_meta = len(sys.argv) == 2 and sys.argv[1] == "--check-meta"
    show_logs = len(sys.argv) == 2 and sys.argv[1] == "--logs"
    debug_poll = len(sys.argv) == 2 and sys.argv[1] == "--debug-poll"
    health = len(sys.argv) == 2 and sys.argv[1] == "--health"
    meta_ready = len(sys.argv) == 2 and sys.argv[1] == "--meta-ready"
    if len(sys.argv) > 1 and not (check_meta or show_logs or debug_poll or health or meta_ready):
        raise ValueError("Gebruik zonder argument, met --check-meta, --logs, --health, --meta-ready of --debug-poll.")
    command = META_READY_COMMAND if meta_ready else HEALTH_COMMAND if health else DEBUG_POLL_COMMAND if debug_poll else CHECK_META_COMMAND if check_meta else LOG_COMMAND if show_logs else RESTART_COMMAND
    config = launcher_settings()
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(
            hostname=config["HOST"],
            username=config["USER"],
            password=config["SSH_PASSWORD"],
            look_for_keys=False,
            allow_agent=False,
            timeout=15,
        )
        channel = ssh.invoke_shell(term="dumb")
        read_until(channel, r"\$\s*$")
        channel.send("su -\n")
        read_until(channel, r"(?:password|wachtwoord|passwort)\s*:")
        channel.send(config["ROOT_PASSWORD"] + "\n")
        read_until(channel, r"#\s*$")
        channel.send(command + "\n")
        if meta_ready:
            output = read_until(channel, r"#\s*$", timeout=30)
            for line in output.splitlines():
                if "meta_ready=" in line and "python -c" not in line:
                    print(line[:700])
        elif health:
            output = read_until(channel, r"#\s*$", timeout=30)
            for line in output.splitlines():
                if '"version"' in line or '"hook_version"' in line:
                    print(line[:700])
        elif debug_poll:
            output = read_until(channel, r"#\s*$", timeout=60)
            for line in output.splitlines():
                if "diagnostic" in line or "Error" in line or "error" in line or "job" in line or "Traceback" in line or "SyntaxError" in line:
                    print(line[:700])
        elif show_logs:
            output = read_until(channel, r"#\s*$", timeout=60)
            for line in output.splitlines():
                if "social-publisher-1" in line and ("ERROR" in line or "WARNING" in line or "poll" in line.lower() or "heartbeat" in line.lower()):
                    print(line[:700])
        elif check_meta:
            output = read_until(channel, r"\{'facebook':.*'instagram':.*\}", timeout=90)
            match = re.search(r"\{'facebook':.*'instagram':.*\}", output)
            if not match:
                raise RuntimeError("Meta-accountcontrole gaf geen verwacht antwoord.")
            print("Meta-API-accountcontrole geslaagd: " + match.group(0))
        else:
            output = read_until(channel, r"#\s*$", timeout=60)
            if "Error" in output or "error" in output:
                raise RuntimeError("Containerherstart meldde een fout; controleer Docker.")
            print("Social Publisher-container is opnieuw gestart.")
        return 0
    finally:
        ssh.close()


if __name__ == "__main__":
    sys.exit(main())
