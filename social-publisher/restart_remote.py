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
    if len(sys.argv) > 1 and not check_meta:
        raise ValueError("Gebruik zonder argument of met --check-meta.")
    command = CHECK_META_COMMAND if check_meta else RESTART_COMMAND
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
        if check_meta:
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
