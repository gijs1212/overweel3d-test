import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, KeyRound } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export default function ResetPassword() {
  const { updatePassword } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setIsRecovery(true);
    }

    supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsRecovery(true);
      }
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: "Wachtwoorden komen niet overeen", variant: "destructive" });
      return;
    }
    if (password.length < 6) {
      toast({ title: "Wachtwoord moet minimaal 6 tekens zijn", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await updatePassword(password);
      toast({ title: "Wachtwoord bijgewerkt!" });
      navigate("/dashboard");
    } catch (error: any) {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="pt-20 pb-16">
        <div className="container mx-auto px-4 py-16">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-md mx-auto">
            <div className="bg-card rounded-2xl p-8 shadow-overweel-card">
              <h1 className="text-2xl font-bold text-primary mb-2">Nieuw wachtwoord</h1>
              <p className="text-muted-foreground mb-6">Kies een nieuw wachtwoord voor je account.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="password">Nieuw wachtwoord</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 6 tekens" required />
                </div>
                <div>
                  <Label htmlFor="confirmPassword">Bevestig wachtwoord</Label>
                  <Input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" required />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                  Wachtwoord opslaan
                </Button>
              </form>
            </div>
          </motion.div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
