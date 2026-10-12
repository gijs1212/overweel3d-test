from __future__ import annotations

import paramiko

from restart_remote import launcher_settings, read_until


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
    channel = ssh.invoke_shell(term="dumb")
    read_until(channel, r"\$\s*$")
    channel.send("su -\n")
    read_until(channel, r"(?:password|wachtwoord|passwort)\s*:")
    channel.send(config["ROOT_PASSWORD"] + "\n")
    read_until(channel, r"#\s*$")
    channel.send(
        "cd /mnt/truenas-data/docker/social-publisher && "
        "docker compose --env-file .env ps && "
        "docker compose --env-file .env logs --no-color --tail=120 social-publisher\n"
    )
    print(read_until(channel, r"#\s*$", timeout=60))
finally:
    ssh.close()
