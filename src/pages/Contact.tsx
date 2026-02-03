import { useState } from "react";
import { motion } from "framer-motion";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Mail, MessageSquare, Clock, Send, Loader2, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const subjectOptions = [
  { value: "vraag", label: "Vraag over bestelling" },
  { value: "aanvraag", label: "Offerte aanvraag" },
  { value: "compliment", label: "Compliment 🎉" },
  { value: "feedback", label: "Feedback" },
  { value: "slechte-grap", label: "Slechte grap door AI 🤖" },
  { value: "anders", label: "Anders" },
];

export default function Contact() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.email || !formData.subject || !formData.message) {
      toast({
        title: "Vul alle velden in",
        description: "We hebben al je gegevens nodig om je te kunnen helpen.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase.functions.invoke("send-contact-message", {
        body: {
          name: formData.name,
          email: formData.email,
          subject: subjectOptions.find(s => s.value === formData.subject)?.label || formData.subject,
          message: formData.message,
        },
      });

      if (error) throw error;

      setIsSubmitted(true);
      toast({
        title: "Bericht verzonden!",
        description: "We nemen zo snel mogelijk contact met je op.",
      });
    } catch (error) {
      console.error("Contact form error:", error);
      toast({
        title: "Er ging iets mis",
        description: "Probeer het opnieuw of mail direct naar info@overweel3d.nl",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="pt-20 pb-16">
          <div className="container mx-auto px-4 py-16">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-lg mx-auto text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                className="w-24 h-24 mx-auto mb-8 rounded-full bg-accent flex items-center justify-center"
              >
                <Check className="w-12 h-12 text-accent-foreground" />
              </motion.div>
              
              <h1 className="text-3xl font-bold text-primary mb-4">
                Bericht verzonden! 📬
              </h1>
              <p className="text-muted-foreground mb-8">
                Bedankt voor je bericht! We lezen alles persoonlijk en reageren 
                meestal binnen 24 uur. Tot snel!
              </p>
              <Button variant="hero" onClick={() => setIsSubmitted(false)}>
                Nog een bericht sturen
              </Button>
            </motion.div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="pt-20 pb-16">
        {/* Header */}
        <section className="py-16 bg-secondary/50">
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-3xl mx-auto text-center"
            >
              <h1 className="text-4xl md:text-5xl font-bold text-primary mb-4">
                Neem contact op
              </h1>
              <p className="text-lg text-muted-foreground">
                Vraag, opmerking of gewoon zin in een praatje over 3D-printen? We horen graag van je!
              </p>
            </motion.div>
          </div>
        </section>

        {/* Content */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 max-w-6xl mx-auto">
              {/* Contact Info */}
              <div className="lg:col-span-1 space-y-8">
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-card rounded-2xl p-6 shadow-overweel-card"
                >
                  <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-4">
                    <Mail className="w-6 h-6 text-accent" />
                  </div>
                  <h3 className="font-semibold text-primary mb-2">E-mail</h3>
                  <p className="text-muted-foreground">info@overweel3d.nl</p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 }}
                  className="bg-card rounded-2xl p-6 shadow-overweel-card"
                >
                  <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-4">
                    <Clock className="w-6 h-6 text-accent" />
                  </div>
                  <h3 className="font-semibold text-primary mb-2">Reactietijd</h3>
                  <p className="text-muted-foreground">Meestal binnen 24 uur</p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                  className="bg-card rounded-2xl p-6 shadow-overweel-card"
                >
                  <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-4">
                    <MessageSquare className="w-6 h-6 text-accent" />
                  </div>
                  <h3 className="font-semibold text-primary mb-2">Support</h3>
                  <p className="text-muted-foreground">Persoonlijk & vriendelijk</p>
                </motion.div>
              </div>

              {/* Contact Form */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="lg:col-span-2"
              >
                <form
                  onSubmit={handleSubmit}
                  className="bg-card rounded-2xl p-8 shadow-overweel-card"
                >
                  <h2 className="text-2xl font-bold text-primary mb-6">
                    Stuur ons een bericht
                  </h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div>
                      <Label htmlFor="name">Naam</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Je naam"
                      />
                    </div>
                    <div>
                      <Label htmlFor="email">E-mail</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="je@email.nl"
                      />
                    </div>
                  </div>

                  <div className="mb-6">
                    <Label htmlFor="subject">Onderwerp</Label>
                    <Select
                      value={formData.subject}
                      onValueChange={(value) => setFormData({ ...formData, subject: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Kies een onderwerp" />
                      </SelectTrigger>
                      <SelectContent>
                        {subjectOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="mb-6">
                    <Label htmlFor="message">Bericht</Label>
                    <Textarea
                      id="message"
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      placeholder="Vertel ons wat je op je hart hebt..."
                      rows={6}
                    />
                  </div>

                  <Button
                    type="submit"
                    variant="hero"
                    size="lg"
                    disabled={isSubmitting}
                    className="w-full md:w-auto"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Verzenden...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Verstuur bericht
                      </>
                    )}
                  </Button>
                </form>
              </motion.div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
