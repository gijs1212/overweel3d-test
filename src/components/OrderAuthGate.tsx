import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, LogIn, ShoppingCart, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

type OrderAuthGateProps = {
  children: React.ReactNode;
  active: boolean;
  onBackToCart: () => void;
};

/**
 * Requests an account only when the customer enters the details step.
 * The cart remains fully usable before that and profile completion is never
 * required: missing contact or address fields are entered in the order form.
 */
export function OrderAuthGate({ children, active, onBackToCart }: OrderAuthGateProps) {
  const { user, loading, signIn, signUp } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  if (!active || user) return <>{children}</>;

  const handleAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "register") {
        await signUp(email, password, fullName);
        toast({ title: "Account aangemaakt", description: "U kunt nu verder met uw bestelgegevens." });
      } else {
        await signIn(email, password);
        toast({ title: "Welkom terug!", description: "Uw winkelmandje is bewaard; vul nu de ontbrekende bestelgegevens in." });
      }
    } catch (error: unknown) {
      toast({
        title: mode === "register" ? "Registratie mislukt" : "Inloggen mislukt",
        description: error instanceof Error ? error.message : "Probeer het opnieuw.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return <>
    <div aria-hidden className="pointer-events-none select-none opacity-30">{children}</div>
    <Dialog open onOpenChange={(open) => { if (!open) onBackToCart(); }}>
      <DialogContent className="max-w-md [&>button]:hidden" onPointerDownOutside={(event) => event.preventDefault()}>
        {loading ? <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-sm text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /> Account controleren…</div> : <>
          <DialogHeader>
            <DialogTitle>{mode === "register" ? "Maak een account aan" : "Log in voor uw bestelgegevens"}</DialogTitle>
            <DialogDescription>
              Uw winkelmandje blijft bewaard. Een account is pas vanaf deze stap nodig om de bestelling en status veilig aan u te koppelen. Uw profiel hoeft niet vooraf ingevuld te zijn.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAuth} className="space-y-3">
            {mode === "register" && <div><Label>Volledige naam</Label><Input value={fullName} onChange={(event) => setFullName(event.target.value)} required /></div>}
            <div><Label>E-mailadres</Label><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
            <div><Label>Wachtwoord</Label><Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} /></div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "register" ? <UserPlus className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
              {mode === "register" ? "Registreren en verder" : "Inloggen en verder"}
            </Button>
          </form>
          <div className="flex flex-col gap-2 text-center text-sm">
            <button type="button" onClick={() => setMode(mode === "login" ? "register" : "login")} className="text-accent hover:underline">
              {mode === "login" ? "Nog geen account? Registreren" : "Al een account? Inloggen"}
            </button>
            <button type="button" onClick={onBackToCart} className="inline-flex items-center justify-center gap-2 text-xs text-muted-foreground hover:underline">
              <ShoppingCart className="h-3.5 w-3.5" /> Terug naar winkelmandje
            </button>
          </div>
        </>}
      </DialogContent>
    </Dialog>
  </>;
}
