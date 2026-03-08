import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export default function Profile() {
  const { profile, updateProfile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
    company_name: "",
    billing_address: "",
    shipping_address: "",
    postal_code: "",
    city: "",
    country: "Nederland",
    vat_number: "",
  });

  useEffect(() => {
    if (profile) {
      setFormData({
        full_name: profile.full_name || "",
        email: profile.email || "",
        phone: profile.phone || "",
        company_name: profile.company_name || "",
        billing_address: profile.billing_address || "",
        shipping_address: profile.shipping_address || "",
        postal_code: profile.postal_code || "",
        city: profile.city || "",
        country: profile.country || "Nederland",
        vat_number: profile.vat_number || "",
      });
    }
  }, [profile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await updateProfile(formData);
      toast({ title: "Profiel bijgewerkt!" });
    } catch (error: any) {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const update = (field: string, value: string) => setFormData({ ...formData, [field]: value });

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="pt-20 pb-16">
        <div className="container mx-auto px-4 py-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
                <User className="w-6 h-6 text-accent" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-primary">Mijn profiel</h1>
                <p className="text-muted-foreground text-sm">Beheer uw persoonlijke gegevens</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="bg-card rounded-2xl p-8 shadow-overweel-card space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Volledige naam</Label>
                  <Input value={formData.full_name} onChange={(e) => update("full_name", e.target.value)} />
                </div>
                <div>
                  <Label>E-mail</Label>
                  <Input value={formData.email} onChange={(e) => update("email", e.target.value)} type="email" />
                </div>
                <div>
                  <Label>Telefoon</Label>
                  <Input value={formData.phone} onChange={(e) => update("phone", e.target.value)} />
                </div>
                <div>
                  <Label>Bedrijfsnaam (optioneel)</Label>
                  <Input value={formData.company_name} onChange={(e) => update("company_name", e.target.value)} />
                </div>
              </div>

              <div className="border-t border-border pt-6">
                <h3 className="font-semibold text-primary mb-4">Adresgegevens</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <Label>Factuuradres</Label>
                    <Input value={formData.billing_address} onChange={(e) => update("billing_address", e.target.value)} />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Verzendadres</Label>
                    <Input value={formData.shipping_address} onChange={(e) => update("shipping_address", e.target.value)} placeholder="Laat leeg als gelijk aan factuuradres" />
                  </div>
                  <div>
                    <Label>Postcode</Label>
                    <Input value={formData.postal_code} onChange={(e) => update("postal_code", e.target.value)} />
                  </div>
                  <div>
                    <Label>Stad</Label>
                    <Input value={formData.city} onChange={(e) => update("city", e.target.value)} />
                  </div>
                  <div>
                    <Label>Land</Label>
                    <Input value={formData.country} onChange={(e) => update("country", e.target.value)} />
                  </div>
                  <div>
                    <Label>BTW-nummer (optioneel)</Label>
                    <Input value={formData.vat_number} onChange={(e) => update("vat_number", e.target.value)} />
                  </div>
                </div>
              </div>

              <Button type="submit" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Opslaan
              </Button>
            </form>
          </motion.div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
