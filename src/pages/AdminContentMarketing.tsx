import { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Sparkles, Copy, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const PLATFORMS = [
  { value: "instagram", label: "Instagram", description: "Visueel, kort, hashtags" },
  { value: "tiktok", label: "TikTok", description: "Casual, trending, hooks" },
  { value: "linkedin", label: "LinkedIn", description: "Professioneel, educatief" },
  { value: "reddit", label: "Reddit / Quora", description: "Behulpzaam, community-gericht" },
  { value: "email", label: "E-mail marketing", description: "Persoonlijk, waarde-gericht" },
  { value: "outreach", label: "Backlink outreach", description: "Persoonlijk, samenwerkingsgericht" },
];

const CONTENT_TYPES = [
  { value: "social_post", label: "Social media post" },
  { value: "caption", label: "Caption / Hook" },
  { value: "thread", label: "Thread / Carousel" },
  { value: "community_answer", label: "Community antwoord" },
  { value: "email_sequence", label: "E-mail reeks" },
  { value: "outreach_message", label: "Outreach bericht" },
  { value: "lead_magnet_idea", label: "Lead magnet idee" },
  { value: "blog_ideas", label: "Blog ideeën" },
];

export default function AdminContentMarketing() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [platform, setPlatform] = useState("instagram");
  const [contentType, setContentType] = useState("social_post");
  const [topic, setTopic] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState("");

  if (!isAdmin) {
    return (<div className="min-h-screen"><Navbar /><main className="pt-20 pb-16 flex items-center justify-center min-h-[60vh]"><p className="text-muted-foreground">Geen toegang.</p></main><Footer /></div>);
  }

  const handleGenerate = async () => {
    if (!topic.trim()) { toast({ title: "Voer een onderwerp in", variant: "destructive" }); return; }
    setGenerating(true);
    setResult("");
    try {
      const platformInfo = PLATFORMS.find(p => p.value === platform);
      const contentInfo = CONTENT_TYPES.find(c => c.value === contentType);

      const { data, error } = await supabase.functions.invoke("generate-content-marketing", {
        body: { topic, platform: platformInfo?.label, contentType: contentInfo?.label, platformStyle: platformInfo?.description },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data.content || "Geen resultaat ontvangen.");
    } catch (error: any) {
      toast({ title: "Genereren mislukt", description: error.message, variant: "destructive" });
    } finally { setGenerating(false); }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(result);
    toast({ title: "Gekopieerd! 📋" });
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="pt-20 pb-16">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="flex items-center gap-3 mb-8">
            <Button variant="ghost" size="sm" onClick={() => window.history.back()}><ArrowLeft className="w-4 h-4" /> Terug</Button>
            <h1 className="text-2xl font-bold text-primary">📢 Content Marketing</h1>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Generator */}
            <div className="bg-card rounded-2xl p-6 shadow-sm border border-border/50">
              <h3 className="font-semibold text-primary mb-4 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-accent" /> Content genereren
              </h3>
              <div className="space-y-4">
                <div>
                  <Label>Platform</Label>
                  <Select value={platform} onValueChange={setPlatform}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PLATFORMS.map(p => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label} — <span className="text-muted-foreground">{p.description}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Type content</Label>
                  <Select value={contentType} onValueChange={setContentType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CONTENT_TYPES.map(c => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Onderwerp / Context</Label>
                  <Textarea
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    rows={3}
                    placeholder="bijv. Waarom PLA het beste materiaal is voor beginners..."
                  />
                </div>
                <Button onClick={handleGenerate} disabled={generating} className="w-full">
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {generating ? "Bezig met genereren..." : "Genereer content"}
                </Button>
              </div>
            </div>

            {/* Result */}
            <div className="bg-card rounded-2xl p-6 shadow-sm border border-border/50">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-primary">Resultaat</h3>
                {result && (
                  <Button variant="ghost" size="sm" onClick={copyToClipboard}>
                    <Copy className="w-4 h-4" /> Kopiëren
                  </Button>
                )}
              </div>
              {result ? (
                <div className="prose prose-sm max-w-none whitespace-pre-wrap text-foreground/80 bg-muted/50 rounded-lg p-4 max-h-[500px] overflow-y-auto text-sm">
                  {result}
                </div>
              ) : (
                <div className="text-center py-16 text-muted-foreground">
                  <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Genereer content om het resultaat hier te zien.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
