from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from urllib.parse import urlparse

from playwright.async_api import BrowserContext, Page, async_playwright

from .config import settings
from .profile_storage import clear_social_profiles
from .policy import profile_name_from_url


class ManualAttention(RuntimeError):
    def __init__(self, message: str, screenshot_path: str = "") -> None:
        super().__init__(message)
        self.screenshot_path = screenshot_path


@dataclass
class PublishResult:
    status: str
    post_url: str = ""
    screenshot_path: str = ""


@dataclass
class AccountCheckResult:
    status: str
    account_name: str
    account_url: str
    steps: list[str]
    screenshot_path: str = ""
    error: str = ""


class BrowserManager:
    def __init__(self) -> None:
        self._playwright = None
        self._contexts: dict[str, BrowserContext] = {}
        self._profile_lock = asyncio.Lock()

    async def context(self, platform: str) -> BrowserContext:
        async with self._profile_lock:
            if self._playwright is None:
                self._playwright = await async_playwright().start()
            if platform not in self._contexts:
                profile = settings.data_dir / "browser-profiles" / platform
                profile.mkdir(parents=True, exist_ok=True)
                self._contexts[platform] = await self._playwright.chromium.launch_persistent_context(
                    str(profile),
                    executable_path=settings.chromium_path,
                    headless=False,
                    viewport={"width": 1365, "height": 900},
                    args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
                )
            return self._contexts[platform]

    async def reset_login_profiles(self) -> None:
        """Close Chromium and erase only the persisted Meta session."""
        async with self._profile_lock:
            await self._close_unlocked()
            clear_social_profiles(settings.data_dir)

    async def close(self) -> None:
        async with self._profile_lock:
            await self._close_unlocked()

    async def _close_unlocked(self) -> None:
        contexts = list(self._contexts.values())
        self._contexts.clear()
        for context in contexts:
            try:
                await context.close()
            except Exception:
                pass
        if self._playwright is not None:
            try:
                await self._playwright.stop()
            except Exception:
                pass
            self._playwright = None

    async def page(self, platform: str, url: str) -> Page:
        context = await self.context(platform)
        page = context.pages[0] if context.pages else await context.new_page()
        await page.goto(url, wait_until="domcontentloaded", timeout=90_000)
        return page

    async def screenshot(self, page: Page, platform: str, job_id: str) -> str:
        target = settings.data_dir / "failures" / f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{job_id}-{platform}.png"
        await page.screenshot(path=str(target), full_page=True)
        return str(target.relative_to(settings.data_dir))


async def first_visible(page: Page, selectors: Iterable[str], timeout: int = 12_000):
    for selector in selectors:
        locator = page.locator(selector).first
        try:
            await locator.wait_for(state="visible", timeout=timeout)
            return locator
        except Exception:
            continue
    return None


async def visible_profile_url(page: Page, host: str) -> str:
    links = page.locator(f'a[href*="{host}"]')
    try:
        for index in range(min(await links.count(), 30)):
            link = links.nth(index)
            if not await link.is_visible():
                continue
            href = str(await link.get_attribute("href") or "")
            parsed = urlparse(href)
            if host == "facebook.com" and parsed.netloc.lower().startswith("business."):
                continue
            if host in href and "/login" not in href and "/accounts/" not in href:
                return href
    except Exception:
        pass
    return ""


def meta_session_is_authenticated(url: str, cookie_names: set[str], login_form_visible: bool, business_shell_visible: bool) -> bool:
    """A composer textbox is not a login signal; Business Suite opens it separately."""
    parsed = urlparse(url)
    path = parsed.path.lower()
    if login_form_visible or any(part in path for part in ("login", "checkpoint", "recover", "two_step_verification")):
        return False
    if (parsed.hostname or "").lower() != "business.facebook.com":
        return False
    return "c_user" in cookie_names or business_shell_visible


async def meta_session_evidence(page: Page) -> tuple[bool, str]:
    await page.wait_for_timeout(1800)
    login_form = page.locator('input[name="email"], input[name="pass"], input[autocomplete="current-password"]')
    try:
        login_form_visible = await login_form.first.is_visible()
    except Exception:
        login_form_visible = False
    try:
        cookies = await page.context.cookies("https://www.facebook.com")
        cookie_names = {str(cookie.get("name", "")) for cookie in cookies}
    except Exception:
        cookie_names = set()
    try:
        business_shell_visible = await page.get_by_text("Meta Business Suite", exact=True).first.is_visible()
    except Exception:
        business_shell_visible = False
    authenticated = meta_session_is_authenticated(page.url, cookie_names, login_form_visible, business_shell_visible)
    evidence = "Meta-sessie bevestigd via Business Suite" if authenticated else f"Geen actieve Meta-sessie bevestigd op {urlparse(page.url).netloc or 'onbekende pagina'}"
    return authenticated, evidence


def instagram_profile_matches(url: str, expected_url: str) -> bool:
    actual = urlparse(url)
    expected = urlparse(expected_url)
    return (
        (actual.hostname or "").lower() in {"instagram.com", "www.instagram.com"}
        and actual.path.strip("/").split("/")[0].lower() == expected.path.strip("/").split("/")[0].lower()
        and bool(expected.path.strip("/"))
    )


def is_instagram_settings_page(url: str) -> bool:
    parsed = urlparse(url)
    return (
        (parsed.hostname or "").lower() == "business.facebook.com"
        and "/settings/instagram_account" in parsed.path.lower()
    )


def combined_account_label_matches(label: str, expected_url: str) -> bool:
    expected_name = profile_name_from_url(expected_url, "").strip().lower()
    if not expected_name:
        return False
    accounts = [part.strip().lstrip("@").lower() for part in re.split(r"[,|·]", label) if part.strip()]
    return len(accounts) >= 2 and accounts[-1] == expected_name


async def visible_instagram_account_on_home(page: Page, expected_url: str) -> bool:
    """Meta's home account switcher shows the linked Facebook and Instagram profiles."""
    parsed = urlparse(page.url)
    if (parsed.hostname or "").lower() != "business.facebook.com" or "/latest/home" not in parsed.path.lower():
        return False
    switchers = page.locator('[role="combobox"]')
    try:
        for index in range(min(await switchers.count(), 12)):
            switcher = switchers.nth(index)
            if not await switcher.is_visible():
                continue
            if not combined_account_label_matches(await switcher.inner_text(), expected_url):
                continue
            instagram_icon = switcher.locator('img[alt="Instagram"]')
            if await instagram_icon.count() and await instagram_icon.first.is_visible():
                return True
    except Exception:
        pass
    return False


async def visible_instagram_account_in_settings(page: Page, expected_url: str) -> bool:
    """Confirm the configured account on Meta's Instagram-accounts settings page."""
    if not is_instagram_settings_page(page.url):
        return False
    expected_name = profile_name_from_url(expected_url, "").strip().lower()
    if not expected_name:
        return False
    await page.wait_for_timeout(1500)
    links = page.locator('main a[href*="instagram.com/"], [role="main"] a[href*="instagram.com/"]')
    try:
        for index in range(min(await links.count(), 60)):
            link = links.nth(index)
            href = str(await link.get_attribute("href") or "")
            if instagram_profile_matches(href, expected_url) and await link.is_visible():
                return True
    except Exception:
        pass
    for scope in ("main", '[role="main"]'):
        for label in (expected_name, f"@{expected_name}"):
            try:
                matches = page.locator(scope).get_by_text(label, exact=True)
                for index in range(min(await matches.count(), 20)):
                    if await matches.nth(index).is_visible():
                        return True
            except Exception:
                pass
    return False


async def open_meta_channel_choices(page: Page) -> list[str]:
    """Open only the composer and destination picker; never enter or publish text."""
    steps = []
    create = page.get_by_role("button", name=re.compile(r"^(bericht maken|nieuw bericht|maak een bericht|create (a )?post)$", re.I)).first
    try:
        if await create.is_visible() and await create.is_enabled():
            await create.click()
            await page.wait_for_timeout(1400)
            steps.append("Bericht maken geopend voor kanaalcontrole")
    except Exception as exc:
        steps.append(f"Bericht maken openen niet gelukt: {exc}")
    destination = page.get_by_role("button", name=re.compile(r"^(publiceren op|plaatsen op|publish to|post to)(:.*)?$", re.I)).first
    try:
        if await destination.is_visible() and await destination.is_enabled():
            await destination.click()
            await page.wait_for_timeout(700)
            steps.append("Publicatiekanalen zichtbaar gemaakt")
    except Exception as exc:
        steps.append(f"Kanaalkeuze openen niet gelukt: {exc}")
    return steps


async def visible_instagram_channel(page: Page, expected_url: str) -> tuple[bool, str]:
    links = page.locator('a[href*="instagram.com/"]')
    try:
        for index in range(min(await links.count(), 60)):
            link = links.nth(index)
            href = str(await link.get_attribute("href") or "")
            if instagram_profile_matches(href, expected_url) and await link.is_visible():
                return True, href
    except Exception:
        pass
    for role in ("checkbox", "switch"):
        try:
            channel = page.get_by_role(role, name=re.compile(r"Instagram", re.I)).first
            if await channel.is_visible() and await channel.is_enabled():
                return True, ""
        except Exception:
            pass
    for scope in ('[role="dialog"]', '[role="menu"]', '[role="listbox"]', "main"):
        try:
            label = page.locator(scope).get_by_text("Instagram", exact=True).first
            if await label.is_visible():
                return True, ""
        except Exception:
            pass
    return False, ""


async def check_meta_accounts(manager: BrowserManager, check_id: str, page_name: str) -> dict[str, AccountCheckResult]:
    steps = ["Meta Business Suite-overzicht openen"]
    page = await manager.page("meta", "https://business.facebook.com/latest/home")
    authenticated, evidence = await meta_session_evidence(page)
    steps.append(evidence)
    if not authenticated:
        screenshot = await manager.screenshot(page, "meta-check", check_id)
        error = "Meta Business Suite toont geen bevestigde actieve sessie. Controleer de login in de containerbrowser."
        failed_steps = steps + ["Loginpagina of verlopen sessie; handmatig aanmelden vereist"]
        return {
            "facebook": AccountCheckResult("disconnected", page_name, settings.facebook_page_url, failed_steps, screenshot, error),
            "instagram": AccountCheckResult("disconnected", profile_name_from_url(settings.instagram_account_url, "Instagram"), settings.instagram_account_url, failed_steps, screenshot, error),
        }

    facebook_status = "connected"
    facebook_error = ""
    page_visible = False
    try:
        page_label = page.get_by_text(page_name, exact=True)
        for index in range(min(await page_label.count(), 10)):
            if await page_label.nth(index).is_visible():
                page_visible = True
                break
    except Exception:
        pass
    steps.append(f"Facebookpagina '{page_name}' zichtbaar" if page_visible else "Meta-login actief; Facebookpagina nog niet afzonderlijk bevestigd")

    detected_facebook_url = await visible_profile_url(page, "facebook.com")
    facebook_url = detected_facebook_url or settings.facebook_page_url

    instagram_available = await visible_instagram_account_on_home(page, settings.instagram_account_url)
    detected_instagram_url = ""
    if instagram_available:
        steps.append("Facebook en ingesteld Instagram-profiel samen zichtbaar in Meta-accountkeuze")
    else:
        # A successful Meta login is distinct from having the post composer open.
        # Only visit the composer if the home account switcher gives no evidence.
        try:
            page = await manager.page("meta", "https://business.facebook.com/latest/composer")
            steps.append("Berichtcomposer geopend voor kanaalcontrole")
        except Exception as exc:
            steps.append(f"Berichtcomposer kon niet worden geopend: {exc}")
        steps.extend(await open_meta_channel_choices(page))
        instagram_available, detected_instagram_url = await visible_instagram_channel(page, settings.instagram_account_url)
    if not instagram_available:
        try:
            page = await manager.page("meta", "https://business.facebook.com/latest/settings/instagram_accounts")
            steps.append("Instagram-accounts in Business Suite geopend")
            instagram_available = await visible_instagram_account_in_settings(page, settings.instagram_account_url)
            steps.append("Ingesteld Instagram-profiel in accountinstellingen gevonden" if instagram_available else "Ingesteld Instagram-profiel niet in accountinstellingen gevonden")
        except Exception as exc:
            steps.append(f"Instagram-accountinstellingen konden niet worden gecontroleerd: {exc}")
    instagram_url = detected_instagram_url or settings.instagram_account_url
    instagram_name = profile_name_from_url(instagram_url, "Instagram")
    instagram_status = "connected" if instagram_available else "manual_attention"
    instagram_error = "" if instagram_available else "Meta is ingelogd, maar het ingestelde Instagram-profiel is niet bevestigd in de composer of accountinstellingen. Controleer de profiel-URL en het controlescherm."
    steps.append("Instagram als publicatiekanaal bevestigd" if instagram_available else "Instagram-kanaal niet bevestigd")

    screenshot = await manager.screenshot(page, "meta-check", check_id)
    completed_steps = steps + ["Controlescreenshot opgeslagen", "Accountstatus naar de website gestuurd"]
    return {
        "facebook": AccountCheckResult(facebook_status, page_name, facebook_url, completed_steps, screenshot, facebook_error),
        "instagram": AccountCheckResult(instagram_status, instagram_name, instagram_url, completed_steps, screenshot, instagram_error),
    }


async def ensure_meta_page(manager: BrowserManager, page: Page, job_id: str, page_name: str) -> None:
    confirmed = page.locator('[aria-selected="true"], [aria-current="page"], button').filter(has_text=page_name)
    try:
        if await confirmed.count() and await confirmed.first.is_visible():
            return
    except Exception:
        pass

    selectors = [
        'button[aria-label*="pagina" i]', 'button[aria-label*="page" i]',
        '[role="button"]:has-text("Pagina")', '[role="button"]:has-text("Page")',
        '[role="button"]:has-text("Facebook")',
    ]
    opener = await first_visible(page, selectors, timeout=4_000)
    if opener:
        try:
            await opener.click()
            choice = page.get_by_text(page_name, exact=True).last
            await choice.wait_for(state="visible", timeout=8_000)
            await choice.click()
            await page.wait_for_timeout(1200)
        except Exception:
            pass

    try:
        selected = page.locator('[aria-selected="true"], [aria-current="page"], button').filter(has_text=page_name)
        if await selected.count() and await selected.first.is_visible():
            return
    except Exception:
        pass
    shot = await manager.screenshot(page, "meta", job_id)
    raise ManualAttention(f"Facebookpagina '{page_name}' kon niet als bestemming worden bevestigd.", shot)


async def publish_meta(manager: BrowserManager, job_id: str, text: str, media: list[Path], dry_run: bool, page_name: str, target_channels: list[str]) -> PublishResult:
    page = await manager.page("meta", "https://business.facebook.com/latest/composer")
    await ensure_meta_page(manager, page, job_id, page_name)
    # Business Suite onthoudt meestal de vorige kanaalkeuze. Wanneer de
    # kanaalkeuzes in de composer zichtbaar zijn, zetten we precies de gevraagde
    # kanalen aan en de overige kanalen uit.
    for channel in ("Facebook", "Instagram"):
        labels = page.get_by_text(channel, exact=True)
        try:
            count = await labels.count()
            for index in range(min(count, 4)):
                label = labels.nth(index)
                checkbox = label.locator("xpath=ancestor::*[self::label or @role='checkbox' or @role='switch'][1]")
                if await checkbox.count() and await checkbox.is_visible():
                    checked = await checkbox.get_attribute("aria-checked")
                    should_enable = channel.lower() in target_channels
                    if (checked == "false" and should_enable) or (checked == "true" and not should_enable):
                        await checkbox.click()
                    break
        except Exception:
            # Een wijziging in dit optionele selectiestuk mag de composer niet
            # blokkeren; de uiteindelijke publicatieknop wordt wel strikt getest.
            pass
    editor = await first_visible(page, [
        'div[contenteditable="true"][role="textbox"]',
        'textarea[placeholder*="bericht" i]',
        'textarea[placeholder*="post" i]',
    ], timeout=20_000)
    if not editor:
        shot = await manager.screenshot(page, "meta", job_id)
        raise ManualAttention("Meta Business Suite is niet ingelogd of de composer is gewijzigd.", shot)
    await editor.fill(text)
    if media:
        file_input = page.locator('input[type="file"]').first
        await file_input.set_input_files([str(path) for path in media[:10]])
        await asyncio.sleep(3)
    if dry_run:
        return PublishResult("dry_run", screenshot_path=await manager.screenshot(page, "meta", job_id))
    button = await first_visible(page, [
        'button:has-text("Publiceren")', 'button:has-text("Publish")',
        '[role="button"]:has-text("Publiceren")', '[role="button"]:has-text("Publish")',
    ], timeout=15_000)
    if not button or await button.is_disabled():
        shot = await manager.screenshot(page, "meta", job_id)
        raise ManualAttention("De knop Publiceren in Meta is niet beschikbaar.", shot)
    await button.click()
    await page.wait_for_timeout(3500)
    return PublishResult("published", post_url=page.url)
