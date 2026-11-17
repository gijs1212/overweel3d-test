import { useEffect, useState } from "react";
import { Facebook, Instagram, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export const SOCIAL_FOLLOW_PROMPT_KEY = "overweel3d:social-follow-prompt:2026-11-v1";
export const FACEBOOK_URL = "https://www.facebook.com/profile.php?id=61595120037678";
export const INSTAGRAM_URL = "https://www.instagram.com/overweel3d/";

function hasSeenPrompt() {
  try { return window.localStorage.getItem(SOCIAL_FOLLOW_PROMPT_KEY) === "seen"; }
  catch { return false; }
}

function rememberPrompt() {
  try { window.localStorage.setItem(SOCIAL_FOLLOW_PROMPT_KEY, "seen"); }
  catch { /* The popup still remains dismissible when storage is unavailable. */ }
}

export default function SocialFollowPopup() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (hasSeenPrompt()) return;
    const timer = window.setTimeout(() => setOpen(true), 1400);
    return () => window.clearTimeout(timer);
  }, []);

  const close = () => {
    rememberPrompt();
    setOpen(false);
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/45 p-3 backdrop-blur-[2px] sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="social-follow-title">
      <section className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-white/10 bg-black p-7 text-white shadow-2xl sm:p-9">
        <button type="button" onClick={close} className="absolute right-4 top-4 rounded-full p-2 text-white/55 transition hover:bg-white/10 hover:text-white" aria-label="Sluiten"><X className="h-5 w-5" /></button>
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-white/45">Blijf op de hoogte</p>
        <h2 id="social-follow-title" className="mt-3 pr-8 text-3xl font-bold tracking-tight">Volg Overweel3D</h2>
        <p className="mt-3 text-sm leading-6 text-white/65">Bekijk nieuwe prints, kleuren, producten en updates via Facebook en Instagram.</p>
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <Button asChild className="h-12 bg-white text-black hover:bg-white/90" onClick={close}>
            <a href={FACEBOOK_URL} target="_blank" rel="noreferrer"><Facebook className="h-4 w-4" /> Facebook</a>
          </Button>
          <Button asChild className="h-12 bg-white text-black hover:bg-white/90" onClick={close}>
            <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer"><Instagram className="h-4 w-4" /> Instagram</a>
          </Button>
        </div>
        <button type="button" onClick={close} className="mt-5 w-full text-center text-xs font-medium text-white/45 underline-offset-4 hover:text-white hover:underline">Niet nu</button>
      </section>
    </div>
  );
}
