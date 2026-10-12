from __future__ import annotations

from pathlib import Path

import paramiko

from restart_remote import launcher_settings, read_until


archive = Path(r"C:\Users\gijso\AppData\Local\Temp\overweel3d-social-pocketbase-rollback.tar.gz")
remote_archive = "/tmp/overweel3d-social-pocketbase-rollback.tar.gz"
target = "/mnt/truenas-data/docker/social-publisher"
config = launcher_settings()
ssh = paramiko.SSHClient()
ssh.load_system_host_keys()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(
    hostname=config["HOST"],
    username=config["USER"],
    password=config["SSH_PASSWORD"],
    look_for_keys=False,
    allow_agent=False,
    timeout=15,
)
try:
    with ssh.open_sftp() as sftp:
        sftp.put(str(archive), remote_archive)
    channel = ssh.invoke_shell(term="dumb")
    read_until(channel, r"\$\s*$")
    channel.send("su -\n")
    read_until(channel, r"(?:password|wachtwoord|passwort)\s*:")
    channel.send(config["ROOT_PASSWORD"] + "\n")
    read_until(channel, r"#\s*$")
    channel.send(
        f"setpriv --reuid 3000 --regid 3001 --clear-groups tar --no-same-owner -xzf {remote_archive} -C {target} && "
        f"setpriv --reuid 3000 --regid 3001 --clear-groups rm -f {target}/app/appwrite.py && "
        f"rm -f {remote_archive} && "
        f"cd {target} && docker compose --env-file .env build --no-cache social-publisher && "
        "docker compose --env-file .env up -d --force-recreate social-publisher && "
        "sleep 8 && docker compose --env-file .env ps && "
        "docker compose --env-file .env logs --no-color --tail=60 social-publisher\n"
    )
    output = read_until(channel, r"#\s*$", timeout=300)
    print(output)
    if "ModuleNotFoundError" in output or "Traceback" in output:
        raise RuntimeError("De PocketBase Social Publisher startte niet schoon.")
finally:
    ssh.close()
