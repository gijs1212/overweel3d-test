import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export default function ForgotPassword() {
  const { resetPassword } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await resetPassword(email);
      setSent(true);
      toast({ title: "E-mail verzonden", description: "Check je inbox voor de reset link." });
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
              <h1 className="text-2xl font-bold text-primary mb-2">Wachtwoord vergeten</h1>
              {sent ? (
                <div className="text-center py-8">
                  <Mail className="w-16 h-16 text-accent mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    We hebben een e-mail gestuurd naar <strong>{email}</strong> met een link om uw wachtwoord te resetten.
                  </p>
                  <Link to="/login" className="text-accent hover:underline mt-4 inline-block">
                    Terug naar inloggen
                  </Link>
                </div>
              ) : (
                <>
                  <p className="text-muted-foreground mb-6">Vul uw e-mailadres in en we sturen u een reset link.</p>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <Label htmlFor="email">E-mailadres</Label>
                      <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="je@email.nl" required />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                      Verstuur reset link
                    </Button>
                  </form>
                  <p className="text-sm text-muted-foreground mt-4 text-center">
                    <Link to="/login" className="text-accent hover:underline">Terug naar inloggen</Link>
                  </p>
                </>
              )}
            </div>
          </motion.div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
