from __future__ import annotations

import asyncio
import hmac
import logging
import time
from collections import deque
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, status
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel

from .config import settings
from .meta_config import load_meta_config, save_meta_config
from .pairing import pairing_store
from .worker import SocialWorker

VERSION = "2.8.0"
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("overweel3d.social")


class DashboardLogHandler(logging.Handler):
    """Keep recent application logs for the password-protected dashboard."""

    def __init__(self, maximum: int = 500) -> None:
        super().__init__()
        self.lines: deque[str] = deque(maxlen=maximum)
        self.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))

    def emit(self, record: logging.LogRecord) -> None:
        try:
            if record.name == "uvicorn.access" and (
                "/api/status" in record.getMessage() or "/api/logs" in record.getMessage()
            ):
                return
            self.lines.append(self.format(record))
        except Exception:
            self.handleError(record)


dashboard_logs = DashboardLogHandler()
logging.getLogger().addHandler(dashboard_logs)
logging.getLogger("uvicorn").addHandler(dashboard_logs)
logging.getLogger("uvicorn.access").addHandler(dashboard_logs)
security = HTTPBasic()
load_meta_config()
worker = SocialWorker()
pair_attempts: list[float] = []


class PairRequest(BaseModel):
    pairing_code: str
    token: str
    pocketbase_url: str


class MetaConfigRequest(BaseModel):
    page_access_token: str
    page_id: str
    instagram_user_id: str


def authorized(credentials: HTTPBasicCredentials = Depends(security)) -> str:
    valid_user = hmac.compare_digest(credentials.username.encode(), b"admin")
    valid_password = hmac.compare_digest(credentials.password.encode(), settings.control_password.encode())
    if not (valid_user and valid_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, headers={"WWW-Authenticate": "Basic"})
    return credentials.username


@asynccontextmanager
async def lifespan(_: FastAPI):
    worker_task = asyncio.create_task(worker.run())
    try:
        yield
    finally:
        worker.stop_event.set()
        worker.request_immediate_poll()
        await worker_task
        await worker.browsers.close()
        await worker.meta.close()
        await worker.pb.close()


app = FastAPI(title="Overweel3D Social Publisher", version=VERSION, lifespan=lifespan)


@app.get("/health")
async def health():
    return {
        "ok": True,
        "version": VERSION,
        "paired": pairing_store.paired,
        "connected": worker.is_connected,
        "last_heartbeat_at": worker.last_heartbeat_at,
    }


@app.post("/api/pair")
async def pair_container(payload: PairRequest, background_tasks: BackgroundTasks):
    now = time.monotonic()
    pair_attempts[:] = [attempt for attempt in pair_attempts if now - attempt < 300]
    if len(pair_attempts) >= 10:
        raise HTTPException(status_code=429, detail="Te veel koppelpogingen. Probeer over vijf minuten opnieuw.")
    pair_attempts.append(now)
    try:
        pairing_store.pair(payload.pairing_code.strip(), payload.token.strip(), payload.pocketbase_url.strip())
    except ValueError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    log.info("Websitekoppeling opgeslagen; eerste heartbeat wordt verzonden.")
    background_tasks.add_task(worker.heartbeat)
    worker.request_immediate_poll()
    return {"ok": True, "paired": True, "heartbeat_pending": True, "version": VERSION}


@app.post("/api/wake")
async def wake_publisher(x_overweel_social_token: str = Header(default="")):
    if not pairing_store.token or not hmac.compare_digest(x_overweel_social_token, pairing_store.token):
        raise HTTPException(status_code=403, detail="Ongeldige interne publishersleutel.")
    worker.request_immediate_poll()
    log.info("Directe publicatie gevraagd; wachtrij wordt meteen gecontroleerd.")
    return {"ok": True}


@app.get("/api/status")
async def dashboard_status(_: str = Depends(authorized)):
    return {
        "version": VERSION,
        "paired": pairing_store.paired,
        "pairing_code": pairing_store.pairing_code,
        "connected": worker.is_connected,
        "last_heartbeat_at": worker.last_heartbeat_at,
        "last_connection_error": worker.last_connection_error,
        "pocketbase_url": pairing_store.pocketbase_url,
        "facebook_page": settings.facebook_page_name,
        "meta_api_configured": bool(settings.meta_page_access_token and settings.meta_page_id and settings.meta_instagram_user_id),
    }


@app.get("/api/logs")
async def dashboard_log_lines(_: str = Depends(authorized)):
    return {"lines": list(dashboard_logs.lines)}


@app.post("/api/meta-config")
async def configure_meta(payload: MetaConfigRequest, _: str = Depends(authorized)):
    try:
        save_meta_config(payload.page_access_token, payload.page_id, payload.instagram_user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    log.info("Meta API-configuratie beveiligd opgeslagen; herstart de container om die te activeren.")
    return {"ok": True, "restart_required": True}


@app.get("/", response_class=HTMLResponse)
async def dashboard(_: str = Depends(authorized)):
    return HTMLResponse(
        Path(__file__).with_name("dashboard.html").read_text(encoding="utf-8"),
        headers={"Cache-Control": "private, no-store"},
    )


@app.get("/dashboard.js")
async def dashboard_script(_: str = Depends(authorized)):
    return FileResponse(
        Path(__file__).with_name("dashboard.js"),
        media_type="text/javascript",
        headers={"Cache-Control": "private, no-store"},
    )


@app.post("/open/meta")
async def open_meta(_: str = Depends(authorized)):
    await worker.browsers.page("meta", "https://business.facebook.com/latest/home")
    return RedirectResponse("/", status_code=303)


@app.post("/reset-logins")
async def reset_logins(_: str = Depends(authorized)):
    await worker.browsers.reset_login_profiles()
    for platform in ("facebook", "instagram"):
        try:
            await worker.pb.action(
                "session",
                {
                    "platform": platform,
                    "status": "disconnected",
                    "error": "Meta-login handmatig gewist; opnieuw aanmelden vereist.",
                    "screenshot_path": "",
                },
            )
        except Exception:
            log.exception("Sessiestatus voor %s kon niet worden bijgewerkt", platform)
    log.info("Opgeslagen Meta-login gewist.")
    return RedirectResponse("/?reset=1", status_code=303)


@app.get("/failures/{name}")
async def failure_screenshot(name: str, _: str = Depends(authorized)):
    safe_name = name.replace("/", "").replace("\\", "")
    target = settings.data_dir / "failures" / safe_name
    if not target.is_file():
        raise HTTPException(404)
    return FileResponse(target, media_type="image/png", headers={"Cache-Control": "private, no-store"})
