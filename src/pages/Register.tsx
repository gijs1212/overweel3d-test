import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export default function Register() {
  const { signUp } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

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
      await signUp(email, password, fullName);
      toast({
        title: "Account aangemaakt!",
        description: "U ontvangt een welkomstmail. Controleer ook uw e-mail om het account te bevestigen.",
      });
      navigate("/login");
    } catch (error: unknown) {
      toast({ title: "Registratie mislukt", description: error instanceof Error ? error.message : "Probeer het opnieuw.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="pt-20 pb-16">
        <div className="container mx-auto px-4 py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md mx-auto"
          >
            <div className="bg-card rounded-2xl p-8 shadow-overweel-card">
              <h1 className="text-2xl font-bold text-primary mb-2">Registreren</h1>
              <p className="text-muted-foreground mb-6">
                Maak een account aan om bestellingen te plaatsen en te volgen.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="fullName">Volledige naam</Label>
                  <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jan Jansen" required />
                </div>
                <div>
                  <Label htmlFor="email">E-mailadres</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="u@email.nl" required />
                </div>
                <div>
                  <Label htmlFor="password">Wachtwoord</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 6 tekens" required />
                </div>
                <div>
                  <Label htmlFor="confirmPassword">Bevestig wachtwoord</Label>
                  <Input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" required />
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  Registreren
                </Button>
              </form>

              <p className="text-sm text-muted-foreground mt-6 text-center">
                Al een account?{" "}
                <Link to="/login" className="text-accent hover:underline font-medium">Inloggen</Link>
              </p>
            </div>
          </motion.div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
