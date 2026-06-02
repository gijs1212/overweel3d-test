import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, LogIn, UserPlus, Save } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

/**
 * Forces auth + complete profile before user can place an order.
 * - If not logged in: shows non-dismissible login/register dialog.
 * - If logged in but profile incomplete: shows non-dismissible profile form.
 */
export function OrderAuthGate({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, signIn, signUp, updateProfile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  // Profile form
  const [profileForm, setProfileForm] = useState({
    full_name: "",
    phone: "",
    billing_address: "",
    shipping_address: "",
    postal_code: "",
    city: "",
    country: "Nederland",
  });

  useEffect(() => {
    if (profile) {
      setProfileForm({
        full_name: profile.full_name || "",
        phone: profile.phone || "",
        billing_address: profile.billing_address || "",
        shipping_address: profile.shipping_address || "",
        postal_code: profile.postal_code || "",
        city: profile.city || "",
        country: profile.country || "Nederland",
      });
    }
  }, [profile]);

  const profileComplete = !!(
    profile?.full_name &&
    profile?.phone &&
    profile?.billing_address &&
    profile?.postal_code &&
    profile?.city
  );

  if (loading) return null;

  // Logged in + complete profile => render order flow
  if (user && profileComplete) return <>{children}</>;

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "register") {
        await signUp(email, password, fullName);
        toast({ title: "Account aangemaakt", description: "Vul nu uw gegevens in om verder te gaan." });
      } else {
        await signIn(email, password);
        toast({ title: "Welkom terug!" });
      }
    } catch (err: any) {
      toast({
        title: mode === "register" ? "Registratie mislukt" : "Inloggen mislukt",
        description: err.message || "Probeer het opnieuw.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await updateProfile(profileForm);
      toast({ title: "Profiel opgeslagen" });
    } catch (err: any) {
      toast({ title: "Opslaan mislukt", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  // Non-dismissible: ignore close attempts
  const noClose = () => {};

  return (
    <>
      {/* Render the page behind so layout/sizing is consistent, but dialog blocks */}
      <div aria-hidden className="pointer-events-none select-none opacity-30">{children}</div>

      <Dialog open={true} onOpenChange={noClose}>
        <DialogContent
          className="max-w-md [&>button]:hidden"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          {!user ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {mode === "register" ? "Maak een account aan" : "Log in om te bestellen"}
                </DialogTitle>
                <DialogDescription>
                  Een account is verplicht om een bestelling te plaatsen. Hiermee kunt u de status volgen en gegevens opslaan voor later.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleAuth} className="space-y-3">
                {mode === "register" && (
                  <div>
                    <Label>Volledige naam</Label>
                    <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                  </div>
                )}
                <div>
                  <Label>E-mailadres</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div>
                  <Label>Wachtwoord</Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : mode === "register" ? (
                    <UserPlus className="w-4 h-4" />
                  ) : (
                    <LogIn className="w-4 h-4" />
                  )}
                  {mode === "register" ? "Registreren" : "Inloggen"}
                </Button>
              </form>

              <div className="flex flex-col gap-2 text-sm text-center">
                <button
                  type="button"
                  onClick={() => setMode(mode === "login" ? "register" : "login")}
                  className="text-accent hover:underline"
                >
                  {mode === "login"
                    ? "Nog geen account? Registreren"
                    : "Al een account? Inloggen"}
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/")}
                  className="text-muted-foreground hover:underline text-xs"
                >
                  Terug naar home
                </button>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Vul uw gegevens in</DialogTitle>
                <DialogDescription>
                  Vul uw verzend- en contactgegevens in voordat u een bestelling kunt plaatsen.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSaveProfile} className="space-y-3 max-h-[60vh] overflow-y-auto">
                <div>
                  <Label>Volledige naam *</Label>
                  <Input
                    value={profileForm.full_name}
                    onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>Telefoon *</Label>
                  <Input
                    value={profileForm.phone}
                    onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>Factuuradres *</Label>
                  <Input
                    value={profileForm.billing_address}
                    onChange={(e) => setProfileForm({ ...profileForm, billing_address: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>Verzendadres</Label>
                  <Input
                    value={profileForm.shipping_address}
                    onChange={(e) => setProfileForm({ ...profileForm, shipping_address: e.target.value })}
                    placeholder="Laat leeg indien gelijk aan factuuradres"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Postcode *</Label>
                    <Input
                      value={profileForm.postal_code}
                      onChange={(e) => setProfileForm({ ...profileForm, postal_code: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label>Stad *</Label>
                    <Input
                      value={profileForm.city}
                      onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div>
                  <Label>Land</Label>
                  <Input
                    value={profileForm.country}
                    onChange={(e) => setProfileForm({ ...profileForm, country: e.target.value })}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Opslaan en verder
                </Button>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}