"""Overweel3D testtool voor Bambu Cloud en Bambu Connect.

De standaardroute haalt cloudinformatie op en draagt een downloadbaar printbestand
over aan Bambu Connect. De private REST-printroute is experimenteel en moet met
twee expliciete opties worden ingeschakeld.

Deze tool gebruikt uitsluitend de Python-standaardbibliotheek.
"""
from __future__ import annotations

import argparse
import ftplib
import getpass
import json
import os
import posixpath
import random
import re
import shutil
import socket
import ssl
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


TOOL_VERSION = "1.2.2"
API_BASE_URL = "https://api.bambulab.com"
DEFAULT_EMAIL = "gijsoverweel@gmail.com"
DEFAULT_SERIAL = "01P00C590102306"
DEFAULT_ACCOUNT_PASSWORD = "Gijs1212!"
DEFAULT_FTPS_HOST = "192.168.2.3"
DEFAULT_FTPS_USERNAME = "bblp"
DEFAULT_FTPS_ACCESS_CODE = "19159570"
DEFAULT_FTPS_PORT = 990
# Eén centrale verwijzing voor officieel door Bambu verstrekte credentials.
# Vul hier het pad naar partner-credentials.json in, of gebruik de environment
# variable BAMBU_PARTNER_CREDENTIALS_FILE. Zet PEM-sleutels niet in dit script.
OFFICIAL_BAMBU_PARTNER_CREDENTIALS_FILE = str(Path(__file__).with_name("cert.json"))
SESSION_FILE = (
    Path(os.environ.get("LOCALAPPDATA") or Path.home())
    / "Overweel3D"
    / "bambu-connect-test-session.json"
)
RETRY_STATUSES = {408, 425, 429, 500, 502, 503, 504}
SENSITIVE_KEYS = {
    "authorization",
    "password",
    "token",
    "access_token",
    "accesstoken",
    "refresh_token",
    "refreshtoken",
    "access_code",
    "dev_access_code",
    "code",
    "file_url",
    "fileurl",
    "download_url",
    "downloadurl",
    "signed_url",
    "url",
    "cover",
    "thumbnail",
}


class Tee:
    def __init__(self, console: Any, logfile: Any) -> None:
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


class ApiError(RuntimeError):
    def __init__(self, method: str, url: str, status: int, body: str) -> None:
        super().__init__(f"{method} {url} gaf HTTP {status}: {body[:500]}")
        self.status = status
        self.body = body


@dataclass(frozen=True)
class CloudFile:
    name: str
    file_id: str
    file_url: str
    source: str


@dataclass(frozen=True)
class SdFile:
    path: str
    size: int | None


@dataclass(frozen=True)
class PartnerCredentials:
    certificate_pem: str
    private_key_pem: str
    crl_pem: str
    api_base_url: str


def load_partner_credentials() -> PartnerCredentials | None:
    configured = (
        os.environ.get("BAMBU_PARTNER_CREDENTIALS_FILE", "").strip()
        or OFFICIAL_BAMBU_PARTNER_CREDENTIALS_FILE.strip()
    )
    if not configured:
        return None
    config_path = Path(configured).expanduser().resolve()
    try:
        raw_document = config_path.read_text(encoding="utf-8")
    except OSError as exc:
        raise RuntimeError(f"Officieel partnercredentialbestand kan niet worden gelezen: {exc}") from exc

    try:
        parsed = json.loads(raw_document)
        config = parsed if isinstance(parsed, dict) else {}
    except (ValueError, TypeError):
        # cert.json gebruikt bewust een eenvoudig label-formaat:
        # privatekey:\n<PEM>\ncert:\n<PEM>\ncrl:\n<PEM>
        config: dict[str, Any] = {}
        labels = "privatekey|cert|crl|api_base_url"
        for match in re.finditer(
            rf"(?ms)^({labels}):[ \t]*(.*?)(?=^(?:{labels}):|\Z)",
            raw_document,
        ):
            config[match.group(1)] = match.group(2).strip()

    def pem_or_file(*keys: str) -> str:
        value = next((config.get(key) for key in keys if config.get(key)), "")
        if isinstance(value, list):
            value = "\n".join(str(item) for item in value)
        text = str(value or "").strip().replace("\\n", "\n")
        if not text:
            return ""
        if "-----BEGIN" in text:
            return text + ("" if text.endswith("\n") else "\n")
        candidate = Path(text).expanduser()
        if not candidate.is_absolute():
            candidate = config_path.parent / candidate
        if not candidate.is_file():
            raise RuntimeError(f"Credentialbestand bestaat niet: {candidate.resolve()}")
        return candidate.read_text(encoding="utf-8").replace("\\n", "\n")

    certificate_pem = pem_or_file("cert", "certificate_pem", "certificate_file")
    private_key_pem = pem_or_file("privatekey", "private_key_pem", "private_key_file")
    crl_pem = pem_or_file("crl", "crl_pem", "crl_file", "ca_file")
    # Het meegeleverde lege sjabloon activeert partnerauthenticatie nog niet.
    if not certificate_pem and not private_key_pem:
        return None
    if not certificate_pem or not private_key_pem:
        raise RuntimeError("cert.json moet zowel privatekey als cert bevatten")
    if "PRIVATE KEY-----" not in private_key_pem or "BEGIN CERTIFICATE" not in certificate_pem:
        raise RuntimeError("privatekey of cert in cert.json bevat geen herkenbare PEM-inhoud")

    api_base_url = str(config.get("api_base_url") or API_BASE_URL).strip().rstrip("/")
    if not api_base_url.startswith("https://"):
        raise RuntimeError("api_base_url in partnercredentials moet HTTPS gebruiken")
    return PartnerCredentials(certificate_pem, private_key_pem, crl_pem, api_base_url)


def partner_ssl_context(credentials: PartnerCredentials) -> ssl.SSLContext:
    context = ssl.create_default_context()
    # ssl.SSLContext accepteert voor de clientketen alleen bestanden. Ze bestaan
    # uitsluitend tijdens load_cert_chain; daarna houdt OpenSSL ze in geheugen.
    try:
        with tempfile.TemporaryDirectory(prefix="overweel3d-partner-cert-") as temporary:
            cert_path = Path(temporary) / "partner-cert.pem"
            key_path = Path(temporary) / "partner-key.pem"
            cert_path.write_text(credentials.certificate_pem, encoding="utf-8")
            key_path.write_text(credentials.private_key_pem, encoding="utf-8")
            try:
                decoded = ssl._ssl._test_decode_cert(str(cert_path))  # type: ignore[attr-defined]
                not_before = decoded.get("notBefore")
                not_after = decoded.get("notAfter")
                now = time.time()
                if not_before and ssl.cert_time_to_seconds(not_before) > now:
                    raise RuntimeError(f"Partnercertificaat is nog niet geldig: {not_before}")
                if not_after and ssl.cert_time_to_seconds(not_after) < now:
                    raise RuntimeError(f"Partnercertificaat is verlopen: {not_after}")
            except RuntimeError:
                raise
            except (AttributeError, ValueError, ssl.SSLError) as exc:
                raise RuntimeError(f"Geldigheidsperiode van partnercertificaat kan niet worden gelezen: {exc}") from exc
            context.load_cert_chain(certfile=str(cert_path), keyfile=str(key_path))
    except (OSError, ssl.SSLError) as exc:
        raise RuntimeError(f"Officieel partnercertificaat of private key is ongeldig: {exc}") from exc
    return context


@dataclass(frozen=True)
class SdFile:
    path: str
    size: int | None


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Test Bambu Cloud discovery, Bambu Connect en optioneel private REST-print."
    )
    parser.add_argument("--email", default=DEFAULT_EMAIL)
    parser.add_argument("--serial", default=DEFAULT_SERIAL)
    parser.add_argument("--token", default="", help="Bearer-token; liever BAMBU_ACCESS_TOKEN gebruiken")
    parser.add_argument("--password-login", action="store_true", help="Sta interactieve private login toe")
    parser.add_argument("--local-file", help="Sla cloud-discovery over en importeer dit lokale 3MF/G-codebestand")
    parser.add_argument("--source", choices=("ftps", "cloud"), default="ftps", help="Lees standaard de SD-kaart via FTPS")
    parser.add_argument("--ip", default=DEFAULT_FTPS_HOST, help="Lokaal IP-adres van de P1S; wordt na invoer opgeslagen")
    parser.add_argument("--ftps-user", default=DEFAULT_FTPS_USERNAME)
    parser.add_argument("--ftps-port", type=int, default=DEFAULT_FTPS_PORT)
    parser.add_argument("--access-code", default="", help="FTPS-toegangscode; standaard wordt de ingestelde P1S-code gebruikt")
    parser.add_argument("--ftps-root", default="/", help="Startmap op de SD-kaart")
    parser.add_argument("--search", default="", help="Filter de gevonden SD-kaartbestanden op naam of pad")
    parser.add_argument("--method", choices=("bambu_connect", "private_rest"), default="bambu_connect")
    parser.add_argument("--allow-private-rest", action="store_true")
    parser.add_argument("--file-number", type=int, help="Kies een SD- of cloudbestand zonder interactieve vraag")
    parser.add_argument("--timeout", type=float, default=30.0)
    parser.add_argument("--retries", type=int, default=5)
    parser.add_argument("--monitor-seconds", type=int, default=120)
    parser.add_argument("--dry-run", action="store_true", help="Toon de laatste actie maar voer haar niet uit")
    parser.add_argument("--log-dir", default="logs")
    return parser.parse_args()


def redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: "<verborgen>" if key.lower() in SENSITIVE_KEYS else redact(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [redact(item) for item in value]
    return value


class BambuApi:
    def __init__(
        self,
        token: str,
        timeout: float,
        retries: int,
        *,
        base_url: str = API_BASE_URL,
        ssl_context: ssl.SSLContext | None = None,
    ) -> None:
        self.token = token
        self.timeout = timeout
        self.retries = max(1, retries)
        self.base_url = base_url.rstrip("/")
        self.ssl_context = ssl_context

    def request(
        self,
        method: str,
        endpoint: str,
        *,
        body: dict[str, Any] | None = None,
        authenticated: bool = True,
        tolerate: Iterable[int] = (),
    ) -> Any:
        url = endpoint if endpoint.startswith("http") else self.base_url + endpoint
        headers = {"Accept": "application/json", "User-Agent": f"Overweel3D-test/{TOOL_VERSION}"}
        if authenticated:
            headers["Authorization"] = f"Bearer {self.token}"
        data = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(body, separators=(",", ":")).encode("utf-8")
        print(f"HTTP {method} {url}")
        if body is not None:
            print("Requestbody: " + json.dumps(redact(body), ensure_ascii=False, separators=(",", ":")))

        for attempt in range(self.retries):
            request = urllib.request.Request(url, data=data, headers=headers, method=method)
            try:
                with urllib.request.urlopen(request, timeout=self.timeout, context=self.ssl_context) as response:
                    raw = response.read().decode("utf-8", errors="replace")
                    parsed = json.loads(raw) if raw.strip() else {}
                    safe_answer = json.dumps(redact(parsed), ensure_ascii=False, separators=(",", ":"))
                    print(f"HTTP {response.status}; antwoord: {safe_answer[:2000]}")
                    return parsed
            except urllib.error.HTTPError as exc:
                raw = exc.read().decode("utf-8", errors="replace")
                if exc.code in tolerate:
                    print(f"HTTP {exc.code}; endpoint overgeslagen: {raw[:300]}")
                    return None
                if exc.code in RETRY_STATUSES and attempt + 1 < self.retries:
                    retry_after = exc.headers.get("Retry-After")
                    delay = float(retry_after) if retry_after and retry_after.isdigit() else min(30.0, 2**attempt + random.random())
                    print(f"HTTP {exc.code}; nieuwe poging over {delay:.1f}s")
                    time.sleep(delay)
                    continue
                raise ApiError(method, url, exc.code, raw) from exc
            except (urllib.error.URLError, TimeoutError) as exc:
                if attempt + 1 >= self.retries:
                    raise RuntimeError(f"Netwerkfout voor {url}: {exc}") from exc
                delay = min(30.0, 2**attempt + random.random())
                print(f"Netwerkfout: {exc}; nieuwe poging over {delay:.1f}s")
                time.sleep(delay)
        raise RuntimeError(f"Geen antwoord ontvangen van {url}")


def nested_value(data: Any, names: set[str]) -> str:
    if isinstance(data, dict):
        for key, value in data.items():
            if key.lower() in names and isinstance(value, (str, int)) and str(value):
                return str(value)
        for value in data.values():
            found = nested_value(value, names)
            if found:
                return found
    elif isinstance(data, list):
        for value in data:
            found = nested_value(value, names)
            if found:
                return found
    return ""


def load_saved_token(email: str) -> str:
    try:
        saved = json.loads(SESSION_FILE.read_text(encoding="utf-8"))
    except (FileNotFoundError, OSError, ValueError, TypeError):
        return ""
    if str(saved.get("email") or "").casefold() != email.casefold():
        return ""
    expires_at = float(saved.get("expires_at") or 0)
    if expires_at and expires_at <= time.time() + 60:
        return ""
    return str(saved.get("access_token") or "").strip()


def load_saved_state() -> dict[str, Any]:
    try:
        value = json.loads(SESSION_FILE.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (FileNotFoundError, OSError, ValueError, TypeError):
        return {}


def update_saved_state(**changes: Any) -> None:
    state = load_saved_state()
    state.update(changes)
    SESSION_FILE.parent.mkdir(parents=True, exist_ok=True)
    SESSION_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")
    try:
        os.chmod(SESSION_FILE, 0o600)
    except OSError:
        pass


def save_session(email: str, result: Any, email_code: str) -> None:
    token = nested_value(result, {"accesstoken", "access_token", "token"})
    if not token:
        return
    expires_in_text = nested_value(result, {"expiresin", "expires_in"})
    try:
        expires_in = max(0, int(expires_in_text))
    except ValueError:
        expires_in = 0
    update_saved_state(
        email=email,
        access_token=token,
        refresh_token=nested_value(result, {"refreshtoken", "refresh_token"}),
        email_code=email_code,
        saved_at=int(time.time()),
        expires_at=int(time.time()) + expires_in if expires_in else 0,
    )
    print(f"Bambu-sessie en e-mailcode lokaal opgeslagen in {SESSION_FILE}")


def login(email: str, timeout: float, retries: int) -> str:
    password = DEFAULT_ACCOUNT_PASSWORD
    print("Het ingestelde Bambu-wachtwoord wordt automatisch gebruikt en niet gelogd.")
    api = BambuApi("", timeout, retries)
    result = api.request(
        "POST",
        "/v1/user-service/user/login",
        body={"account": email, "password": password, "apiError": ""},
        authenticated=False,
    )
    token = nested_value(result, {"accesstoken", "access_token", "token"})
    if token:
        save_session(email, result, "")
        return token

    text = json.dumps(result).lower()
    if not any(word in text for word in ("code", "verify", "verification")):
        raise RuntimeError("Login leverde geen access-token of herkenbaar verificatieverzoek op")
    api.request(
        "POST",
        "/v1/user-service/user/sendemail/code",
        body={"email": email, "type": "codeLogin"},
        authenticated=False,
        tolerate={400, 404},
    )
    code = getpass.getpass("Voer de ontvangen Bambu e-mailcode in: ").strip()
    result = api.request(
        "POST",
        "/v1/user-service/user/login",
        body={"account": email, "code": code, "apiError": ""},
        authenticated=False,
    )
    token = nested_value(result, {"accesstoken", "access_token", "token"})
    if not token:
        raise RuntimeError("Verificatie-login leverde geen access-token op")
    save_session(email, result, code)
    return token


def records(value: Any, source: str) -> list[CloudFile]:
    found: list[CloudFile] = []
    name_keys = ("file_name", "filename", "name", "title", "subtask_name")
    id_keys = ("file_id", "fileid", "id", "profile_id", "profileid")
    url_keys = ("file_url", "fileurl", "download_url", "downloadurl", "url", "signed_url")
    if isinstance(value, dict):
        lowered = {str(key).lower(): item for key, item in value.items()}
        name = next((str(lowered[key]) for key in name_keys if lowered.get(key)), "")
        file_id = next((str(lowered[key]) for key in id_keys if lowered.get(key)), "")
        file_url = next((str(lowered[key]) for key in url_keys if lowered.get(key)), "")
        printable = name.lower().endswith((".3mf", ".gcode.3mf", ".gcode"))
        if printable and (file_url.startswith("https://") or file_id):
            found.append(CloudFile(name=name, file_id=file_id, file_url=file_url, source=source))
        for child in value.values():
            found.extend(records(child, source))
    elif isinstance(value, list):
        for child in value:
            found.extend(records(child, source))
    return found


def project_ids(data: Any) -> set[str]:
    ids: set[str] = set()
    if isinstance(data, dict):
        for key, value in data.items():
            if key.lower() in {"project_id", "projectid"} and isinstance(value, (str, int)):
                ids.add(str(value))
            else:
                ids.update(project_ids(value))
    elif isinstance(data, list):
        for child in data:
            ids.update(project_ids(child))
    return ids


def task_profiles(data: Any) -> list[tuple[str, str]]:
    """Haal (profileId, modelId) uit de nieuwste cloudtaken."""
    hits = data.get("hits") if isinstance(data, dict) else None
    if not isinstance(hits, list):
        return []
    found: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for task in hits:
        if not isinstance(task, dict):
            continue
        profile_id = str(task.get("profileId") or task.get("profile_id") or "").strip()
        model_id = str(task.get("modelId") or task.get("model_id") or "").strip()
        pair = (profile_id, model_id)
        if profile_id and model_id and pair not in seen:
            seen.add(pair)
            found.append(pair)
    return found


def discover(api: BambuApi, serial: str) -> list[CloudFile]:
    devices = api.request("GET", "/v1/iot-service/api/user/bind")
    if serial.lower() not in json.dumps(devices).lower():
        raise RuntimeError(f"Printer {serial} staat niet in de ontvangen apparatenlijst")
    print(f"Printer {serial} is aan dit account gekoppeld.")
    api.request("GET", "/v1/iot-service/api/user/print?force=true", tolerate={404, 405})

    files: list[CloudFile] = []
    projects = api.request("GET", "/v1/iot-service/api/user/project", tolerate={404, 405})
    if projects:
        files.extend(records(projects, "projectlijst"))
        for project_id in sorted(project_ids(projects)):
            detail = api.request(
                "GET",
                "/v1/iot-service/api/user/project/" + urllib.parse.quote(project_id, safe=""),
                tolerate={404, 405},
            )
            if detail:
                files.extend(records(detail, f"project {project_id}"))

    task_result: Any = None
    for endpoint, source in (
        ("/v1/iot-service/api/user/files", "files"),
        ("/v1/user-service/my/tasks?limit=50", "tasks"),
        ("/v1/iot-service/api/user/task?limit=50", "task-fallback"),
    ):
        # Deze discovery-routes zijn private fallbacks. Een route kan per regio
        # ontbreken of via een upstream-proxy 5xx geven; dat mag de volgende
        # bruikbare bron niet blokkeren.
        result = api.request("GET", endpoint, tolerate={400, 404, 405, 500, 501, 502, 503, 504})
        if result:
            files.extend(records(result, source))
            if source == "tasks":
                task_result = result

    # De huidige /my/tasks-response bevat meestal alleen profileId/modelId en
    # een titel zonder bestandsextensie. De profile-detailroute levert juist
    # filename + de tijdelijke download-URL die Bambu Connect nodig heeft.
    for profile_id, model_id in task_profiles(task_result)[:30]:
        endpoint = (
            "/v1/iot-service/api/user/profile/"
            + urllib.parse.quote(profile_id, safe="")
            + "?model_id="
            + urllib.parse.quote(model_id, safe="")
        )
        detail = api.request("GET", endpoint, tolerate={400, 403, 404, 405, 500, 502, 503, 504})
        if detail:
            files.extend(records(detail, f"profiel {profile_id}"))

    unique: dict[tuple[str, str, str], CloudFile] = {}
    for item in files:
        # Bewaar hoofdletters exact; SD-/object-storagepaden kunnen case-sensitive zijn.
        unique[(item.name, item.file_id, item.file_url)] = item
    return sorted(unique.values(), key=lambda item: item.name.casefold())


def choose_file(files: list[CloudFile], number: int | None) -> CloudFile:
    if not files:
        raise RuntimeError("Geen downloadbare of identificeerbare cloud-printbestanden gevonden")
    print("\nGevonden cloudbestanden:")
    for index, item in enumerate(files, 1):
        availability = "downloadbaar" if item.file_url else "alleen ID"
        print(f"  {index:>3}. {item.name} [{availability}; {item.source}]")
    selected = number
    while selected is None or selected < 1 or selected > len(files):
        try:
            selected = int(input("Kies een bestandsnummer: ").strip())
        except ValueError:
            selected = None
    return files[selected - 1]


def download(url: str, destination: Path, timeout: float) -> None:
    if not url.startswith("https://"):
        raise RuntimeError("Bambu Connect-download vereist een HTTPS-URL")
    parsed_url = urllib.parse.urlsplit(url)
    safe_url = urllib.parse.urlunsplit((parsed_url.scheme, parsed_url.netloc, parsed_url.path, "<verborgen>", ""))
    print(f"Downloaden zonder Bambu Bearer-header: {safe_url}")
    request = urllib.request.Request(url, headers={"User-Agent": f"Overweel3D-test/{TOOL_VERSION}"})
    partial = destination.with_suffix(destination.suffix + ".part")
    try:
        with urllib.request.urlopen(request, timeout=max(timeout, 120.0)) as response, partial.open("wb") as target:
            shutil.copyfileobj(response, target)
        partial.replace(destination)
    finally:
        partial.unlink(missing_ok=True)


class ImplicitFTP_TLS(ftplib.FTP_TLS):
    """Implicit FTPS zoals aangeboden door Bambu-printers op poort 990."""

    def connect(self, host: str = "", port: int = 0, timeout: Any = -999, source_address: Any = None) -> str:
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


def ftps_entries(ftp: ImplicitFTP_TLS, directory: str) -> list[tuple[str, bool, int | None]]:
    previous = ftp.pwd()
    lines: list[str] = []
    try:
        ftp.cwd(directory)
        ftp.dir(lines.append)
    finally:
        ftp.cwd(previous)
    entries: list[tuple[str, bool, int | None]] = []
    for line in lines:
        parts = line.split(maxsplit=8)
        if len(parts) < 6:
            continue
        name = parts[-1].strip()
        if name in {".", ".."}:
            continue
        is_directory = parts[0].startswith("d")
        try:
            size = None if is_directory else int(parts[4])
        except (ValueError, IndexError):
            size = None
        entries.append((name, is_directory, size))
    return entries


def connect_ftps(host: str, port: int, username: str, access_code: str, timeout: float) -> ImplicitFTP_TLS:
    context = ssl.create_default_context()
    # De P1S gebruikt op de lokale FTPS-interface een zelfondertekend certificaat.
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    last_error: Exception | None = None
    for attempt in range(1, 4):
        ftp = ImplicitFTP_TLS(timeout=max(10.0, timeout), context=context)
        try:
            print(f"FTPS verbinden met {host}:{port} als {username} (poging {attempt}/3)")
            ftp.connect(host, port)
            ftp.login(username, access_code)
            ftp.prot_p()
            print("FTPS-verbinding met de SD-kaart is actief.")
            return ftp
        except ftplib.all_errors as exc:
            last_error = exc
            try:
                ftp.close()
            except OSError:
                pass
            if attempt < 3:
                time.sleep(attempt * 2)
    raise RuntimeError(f"FTPS verbinden mislukt na drie pogingen: {last_error}")


def scan_sd_card(ftp: ImplicitFTP_TLS, root: str, search: str) -> list[SdFile]:
    normalized_root = "/" + root.replace("\\", "/").strip("/")
    if normalized_root == "//":
        normalized_root = "/"
    pending = [normalized_root]
    visited: set[str] = set()
    files: dict[str, SdFile] = {}
    while pending and len(visited) < 500:
        directory = pending.pop(0)
        if directory in visited:
            continue
        visited.add(directory)
        try:
            entries = ftps_entries(ftp, directory)
        except ftplib.all_errors as exc:
            print(f"Map overgeslagen: {directory}: {exc}")
            continue
        if len(visited) == 1 or len(visited) % 10 == 0:
            print(f"SD-kaart scannen: {len(visited)} mappen bekeken, {len(files)} printbestanden gevonden...")
        for name, is_directory, size in entries:
            remote_path = posixpath.normpath(posixpath.join(directory, name))
            if not remote_path.startswith("/"):
                remote_path = "/" + remote_path
            if is_directory:
                if remote_path not in visited:
                    pending.append(remote_path)
                continue
            if remote_path.lower().endswith((".gcode", ".3mf", ".gcode.3mf")):
                files[remote_path] = SdFile(remote_path, size)
    result = sorted(files.values(), key=lambda item: item.path.casefold())
    query = search.strip().casefold()
    if query:
        result = [item for item in result if query in item.path.casefold()]
    print(f"SD-kaartscan voltooid: {len(result)} selecteerbare printbestanden.")
    return result


def choose_sd_file(files: list[SdFile], number: int | None) -> SdFile:
    if not files:
        raise RuntimeError("Geen .3mf-, .gcode.3mf- of .gcode-bestanden gevonden")
    print("\nBestanden op de SD-kaart:")
    for index, item in enumerate(files, 1):
        size = f"{item.size / (1024 * 1024):.1f} MB" if item.size is not None else "grootte onbekend"
        print(f"  {index:>3}. {item.path} [{size}]")
    selected = number
    while selected is None or selected < 1 or selected > len(files):
        try:
            selected = int(input("Kies het bestandsnummer van de SD-kaart: ").strip())
        except ValueError:
            selected = None
    return files[selected - 1]


def download_from_ftps(ftp: ImplicitFTP_TLS, item: SdFile, destination: Path) -> None:
    print(f"SD-kaartbestand tijdelijk downloaden: {item.path}")
    with destination.open("wb") as target:
        ftp.retrbinary(f"RETR {item.path}", target.write, blocksize=256 * 1024)
    print(f"FTPS-download voltooid: {destination.stat().st_size} bytes")


def open_bambu_connect(file_path: Path, dry_run: bool) -> None:
    query = urllib.parse.urlencode(
        {"path": str(file_path.resolve()), "name": file_path.name, "version": "1.0.0"},
        quote_via=urllib.parse.quote,
    )
    url = "bambu-connect://import-file?" + query
    print("Bambu Connect URL: " + url)
    if dry_run:
        print("Dry-run: Bambu Connect is niet geopend.")
        return
    if os.name == "nt":
        os.startfile(url)  # type: ignore[attr-defined]
    elif not webbrowser.open(url):
        raise RuntimeError("Het besturingssysteem kon de bambu-connect URL niet openen")
    print("Bestand aan Bambu Connect overgedragen. Controleer printer en instellingen in Bambu Connect.")


def private_rest_print(api: BambuApi, serial: str, item: CloudFile, args: argparse.Namespace) -> None:
    if not args.allow_private_rest:
        raise RuntimeError("Gebruik naast --method private_rest ook --allow-private-rest")
    body = {
        "device_id": serial,
        "file_name": item.name,
        "file_id": item.file_id,
        "file_url": item.file_url,
    }
    print("EXPERIMENTEEL request: " + json.dumps(body, ensure_ascii=False))
    if args.dry_run:
        print("Dry-run: private REST-opdracht is niet verzonden.")
        return
    if input("Typ PRIVATE-PRINT om deze onbevestigde private API te testen: ").strip() != "PRIVATE-PRINT":
        print("Geannuleerd; er is niets verzonden.")
        return
    response = api.request("POST", "/v1/iot-service/api/user/print", body=body)
    print("Submitantwoord: " + json.dumps(response, ensure_ascii=False))
    deadline = time.monotonic() + max(0, args.monitor_seconds)
    while time.monotonic() < deadline:
        status = api.request("GET", "/v1/iot-service/api/user/print?force=true")
        status_text = json.dumps(status, ensure_ascii=False)
        print("Printerstatus: " + status_text[:2000])
        if any(state in status_text.upper() for state in ('"RUNNING"', '"PREPARE"', '"SLICING"')):
            print("De cloudstatus meldt dat de printer de taak verwerkt.")
            return
        time.sleep(5)
    print("Geen actieve printstatus gezien binnen de ingestelde monitortijd.")


def run(args: argparse.Namespace) -> int:
    local_file = Path(args.local_file).expanduser().resolve() if args.local_file else None
    api: BambuApi | None = None

    if local_file and args.method == "bambu_connect":
        if not local_file.is_file():
            raise FileNotFoundError(local_file)
        open_bambu_connect(local_file, args.dry_run)
        return 0

    if args.source == "ftps":
        if args.method != "bambu_connect":
            raise RuntimeError("Een SD-kaartbestand gebruikt --method bambu_connect; private REST verwacht een cloudrecord")
        saved = load_saved_state()
        host = str(args.ip or saved.get("ftps_host") or DEFAULT_FTPS_HOST).strip()
        username = str(args.ftps_user or saved.get("ftps_username") or DEFAULT_FTPS_USERNAME).strip()
        access_code = str(args.access_code or saved.get("ftps_access_code") or DEFAULT_FTPS_ACCESS_CODE).strip()
        if not host:
            host = input("Lokaal IP-adres van de P1S: ").strip()
        if not host or not access_code:
            raise RuntimeError("IP-adres of FTPS-toegangscode ontbreekt")
        update_saved_state(
            ftps_host=host,
            ftps_username=username,
            ftps_port=args.ftps_port,
            ftps_access_code=access_code,
        )
        print(f"FTPS-instellingen opgeslagen in {SESSION_FILE}; toegangscode wordt niet gelogd.")
        ftp = connect_ftps(host, args.ftps_port, username, access_code, args.timeout)
        try:
            files = scan_sd_card(ftp, args.ftps_root, args.search)
            item = choose_sd_file(files, args.file_number)
            print(f"Gekozen SD-kaartbestand: {item.path!r}")
            with tempfile.TemporaryDirectory(prefix="overweel3d-bambu-sd-") as temporary:
                destination = Path(temporary) / posixpath.basename(item.path)
                download_from_ftps(ftp, item, destination)
                open_bambu_connect(destination, args.dry_run)
                if not args.dry_run:
                    input("Druk pas op Enter nadat Bambu Connect het bestand heeft ingelezen; daarna wordt de tijdelijke kopie verwijderd. ")
        finally:
            try:
                ftp.quit()
            except ftplib.all_errors:
                ftp.close()
        return 0

    token = (args.token or os.environ.get("BAMBU_ACCESS_TOKEN", "")).strip()
    if not token:
        token = load_saved_token(args.email)
        if token:
            print(f"Opgeslagen Bambu-sessie geladen uit {SESSION_FILE}; token blijft verborgen.")

    if not token:
        if not args.password_login:
            raise RuntimeError("Stel BAMBU_ACCESS_TOKEN in of gebruik --password-login")
        token = login(args.email, args.timeout, args.retries)
        print("Bambu Cloud-login geslaagd; access-token wordt niet getoond of opgeslagen.")
    partner = load_partner_credentials()
    if partner:
        print("Officieel Bambu-partnercertificaat geladen; certificaat- en sleutelinhoud blijven verborgen.")
        api = BambuApi(
            token,
            args.timeout,
            args.retries,
            base_url=partner.api_base_url,
            ssl_context=partner_ssl_context(partner),
        )
    else:
        api = BambuApi(token, args.timeout, args.retries)
    files = discover(api, args.serial)
    item = choose_file(files, args.file_number)
    print(f"Gekozen: {item.name!r}; bron={item.source}; printer={args.serial}")

    if args.method == "private_rest":
        private_rest_print(api, args.serial, item, args)
        return 0
    if not item.file_url:
        raise RuntimeError("Dit cloudrecord bevat geen download-URL voor Bambu Connect")

    with tempfile.TemporaryDirectory(prefix="overweel3d-bambu-") as temporary:
        destination = Path(temporary) / Path(item.name).name
        download(item.file_url, destination, args.timeout)
        print(f"Tijdelijk bestand: {destination} ({destination.stat().st_size} bytes)")
        open_bambu_connect(destination, args.dry_run)
        if not args.dry_run:
            input("Druk pas op Enter nadat Bambu Connect het bestand heeft ingelezen; daarna wordt de tijdelijke kopie verwijderd. ")
    return 0


def main() -> int:
    args = arguments()
    log_dir = Path(args.log_dir).expanduser().resolve()
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / f"bambu-connect-test-{time.strftime('%Y%m%d-%H%M%S')}.log"
    with log_path.open("w", encoding="utf-8") as logfile:
        original_stdout = sys.stdout
        original_stderr = sys.stderr
        tee = Tee(original_stdout, logfile)
        sys.stdout = tee
        sys.stderr = tee
        try:
            print(f"Overweel3D Bambu Connect testtool {TOOL_VERSION}")
            print(f"Logbestand: {log_path}")
            print(f"Bron: {args.source}; methode: {args.method}; account={args.email}; printer={args.serial}")
            return run(args)
        except Exception as exc:
            print(f"FATALE FOUT: {type(exc).__name__}: {exc}")
            return 1
        finally:
            sys.stdout = original_stdout
            sys.stderr = original_stderr


if __name__ == "__main__":
    raise SystemExit(main())
