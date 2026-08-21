import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Loader2,
  Mail,
  Palette,
  PenLine,
  RefreshCw,
  Search,
  Send,
  Shapes,
  FileText,
  Users,
  XCircle,
} from "lucide-react";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getFunctionErrorMessage } from "@/lib/functionErrors";
import {
  escapeNewsletterCsvCell,
  fetchAllNewsletterSubscriptions,
  type NewsletterSubscription,
} from "@/lib/newsletterAdmin";

type StatusFilter = "all" | "active" | "inactive";
type MailTemplate = "color" | "material" | "article" | "custom";
type ChangeType = "new" | "removed";
type MailAudience = "newsletter" | "all_customers";

const sourceLabels: Record<string, string> = {
  popup: "Nieuwsbriefmelding",
  footer: "Footer",
  website: "Website",
  profile: "Profiel",
};

export default function AdminNewsletter() {
  const { isAdmin, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [subscriptions, setSubscriptions] = useState<NewsletterSubscription[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [mailTemplate, setMailTemplate] = useState<MailTemplate>("color");
  const [changeType, setChangeType] = useState<ChangeType>("new");
  const [itemName, setItemName] = useState("");
  const [details, setDetails] = useState("");
  const [itemUrl, setItemUrl] = useState("");
  const [customSubject, setCustomSubject] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [mailAudience, setMailAudience] = useState<MailAudience>("newsletter");
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false);
  const [sendingCampaign, setSendingCampaign] = useState(false);

  const fetchSubscriptions = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");

    try {
      const data = await fetchAllNewsletterSubscriptions();
      setSubscriptions(data);
    } catch {
      const message = "De nieuwsbriefinschrijvingen konden niet worden geladen.";
      setLoadError(message);
      toast({ title: "Laden mislukt", description: message, variant: "destructive" });
    }

    setIsLoading(false);
  }, [toast]);

  useEffect(() => {
    if (!authLoading && isAdmin) void fetchSubscriptions();
    if (!authLoading && !isAdmin) setIsLoading(false);
  }, [authLoading, fetchSubscriptions, isAdmin]);

  const filteredSubscriptions = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return subscriptions.filter((subscription) => {
      const matchesSearch =
        normalizedSearch === "" ||
        subscription.email.toLowerCase().includes(normalizedSearch) ||
        (sourceLabels[subscription.source] ?? subscription.source).toLowerCase().includes(normalizedSearch);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" ? subscription.active : !subscription.active);

      return matchesSearch && matchesStatus;
    });
  }, [search, statusFilter, subscriptions]);

  const activeCount = subscriptions.filter((subscription) => subscription.active).length;

  const templateLabels: Record<MailTemplate, string> = {
    color: "Kleur",
    material: "Materiaal",
    article: "Artikel",
    custom: "Zelfgeschreven mail",
  };

  const canPrepareCampaign = mailTemplate === "custom"
    ? customSubject.trim().length >= 3 && customMessage.trim().length >= 3
    : itemName.trim().length > 0;

  const sendCampaign = async () => {
    setSendingCampaign(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-marketing-email", {
        body: mailTemplate === "custom"
          ? {
              templateKind: "custom",
              audience: mailAudience,
              subject: customSubject,
              message: customMessage,
            }
          : {
              templateKind: mailTemplate,
              changeType,
              itemName,
              details,
              itemUrl,
            },
      });
      if (error) throw new Error(await getFunctionErrorMessage(error, "De mail kon niet worden verzonden."));
      if (!data?.success) {
        throw new Error(data?.error || `${data?.failedCount || 0} mails konden niet worden verzonden.`);
      }

      toast({
        title: "Mailing verzonden",
        description: `${data.sentCount} van ${data.recipientCount} ontvangers bereikt.`,
      });
      setItemName("");
      setDetails("");
      setItemUrl("");
      setCustomSubject("");
      setCustomMessage("");
    } catch (error) {
      toast({
        title: "Mailing verzenden mislukt",
        description: error instanceof Error ? error.message : "Probeer het later opnieuw.",
        variant: "destructive",
      });
    } finally {
      setSendingCampaign(false);
    }
  };

  const toggleSubscription = async (subscription: NewsletterSubscription) => {
    const nextActive = !subscription.active;
    setUpdatingId(subscription.id);

    try {
      const { data, error } = await supabase
        .from("newsletter_subscriptions")
        .update({
          active: nextActive,
          unsubscribed_at: nextActive ? null : new Date().toISOString(),
        })
        .eq("id", subscription.id)
        .select("id, email, source, active, subscribed_at, unsubscribed_at, created_at, updated_at, user_id, welcome_email_claimed_at, welcome_email_sent_at")
        .single();

      if (error || !data) throw error ?? new Error("Geen inschrijving bijgewerkt");

      const updatedSubscription = data as NewsletterSubscription;
      setSubscriptions((current) =>
        current.map((item) => (item.id === subscription.id ? updatedSubscription : item)),
      );
      toast({
        title: nextActive ? "Inschrijving geactiveerd" : "Inschrijving uitgeschreven",
        description: subscription.email,
      });
    } catch {
      toast({
        title: "Wijzigen mislukt",
        description: "De status van deze inschrijving is niet aangepast.",
        variant: "destructive",
      });
    } finally {
      setUpdatingId(null);
    }
  };

  const exportActiveSubscriptions = () => {
    const activeSubscriptions = subscriptions.filter((subscription) => subscription.active);

    if (activeSubscriptions.length === 0) {
      toast({ title: "Geen actieve inschrijvingen", description: "Er is nog niets om te exporteren." });
      return;
    }

    const rows = [
      ["E-mail", "Bron", "Ingeschreven op"],
      ...activeSubscriptions.map((subscription) => [
        subscription.email,
        sourceLabels[subscription.source] ?? subscription.source,
        subscription.subscribed_at,
      ]),
    ];
    const csv = rows.map((row) => row.map(escapeNewsletterCsvCell).join(",")).join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `overweel3d-nieuwsbrief-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);

    toast({ title: "Export aangemaakt", description: `${activeSubscriptions.length} actieve e-mailadressen.` });
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 aria-label="Toegang controleren" className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="flex min-h-[60vh] items-center justify-center pb-16 pt-20">
          <div className="text-center">
            <h1 className="mb-2 text-2xl font-bold text-primary">Geen toegang</h1>
            <p className="text-muted-foreground">U heeft geen adminrechten.</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="pb-16 pt-20">
        <div className="container mx-auto max-w-6xl px-4 py-8">
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-3">
                <Button asChild aria-label="Terug naar admin dashboard" size="icon" variant="ghost">
                  <Link to="/admin">
                    <ArrowLeft className="h-4 w-4" />
                  </Link>
                </Button>
                <div>
                  <h1 className="text-2xl font-bold text-primary">Nieuwsbriefbeheer</h1>
                  <p className="text-muted-foreground">Beheer en exporteer inschrijvingen voor toekomstige verzendingen.</p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={isLoading} onClick={() => void fetchSubscriptions()} variant="outline">
                <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                Vernieuwen
              </Button>
              <Button onClick={exportActiveSubscriptions}>
                <Download className="h-4 w-4" />
                Actieve lijst exporteren
              </Button>
            </div>
          </div>

          <section className="mb-8 rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
            <div className="mb-6 flex items-start gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <Send className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-primary">Mailing opstellen</h2>
                <p className="text-sm text-muted-foreground">
                  Gebruik een standaardbericht voor een assortimentwijziging of schrijf zelf een bericht.
                </p>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,240px)_1fr]">
              <div className="space-y-3">
                <Label htmlFor="mail-template">Type bericht</Label>
                <Select value={mailTemplate} onValueChange={(value) => setMailTemplate(value as MailTemplate)}>
                  <SelectTrigger id="mail-template"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="color"><span className="flex items-center gap-2"><Palette className="h-4 w-4" />Kleur</span></SelectItem>
                    <SelectItem value="material"><span className="flex items-center gap-2"><Shapes className="h-4 w-4" />Materiaal</span></SelectItem>
                    <SelectItem value="article"><span className="flex items-center gap-2"><FileText className="h-4 w-4" />Artikel</span></SelectItem>
                    <SelectItem value="custom"><span className="flex items-center gap-2"><PenLine className="h-4 w-4" />Zelfgeschreven mail</span></SelectItem>
                  </SelectContent>
                </Select>

                {mailTemplate !== "custom" && (
                  <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                    Standaardmails gaan uitsluitend naar actieve nieuwsbriefabonnees. Kies of het item nieuw is of uit het aanbod verdwijnt.
                  </div>
                )}
              </div>

              <div className="space-y-4">
                {mailTemplate === "custom" ? (
                  <>
                    <div>
                      <Label htmlFor="mail-audience">Ontvangers</Label>
                      <Select value={mailAudience} onValueChange={(value) => setMailAudience(value as MailAudience)}>
                        <SelectTrigger id="mail-audience" className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="newsletter">Actieve nieuwsbriefabonnees</SelectItem>
                          <SelectItem value="all_customers">Alle klanten</SelectItem>
                        </SelectContent>
                      </Select>
                      {mailAudience === "all_customers" && (
                        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                          Alle klanten bevat unieke e-mailadressen uit klantprofielen en bestellingen. Gebruik dit alleen voor een relevant klantbericht.
                        </p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="custom-subject">Onderwerp</Label>
                      <Input id="custom-subject" className="mt-1" maxLength={160} value={customSubject} onChange={(event) => setCustomSubject(event.target.value)} placeholder="Onderwerp van de e-mail" />
                    </div>
                    <div>
                      <Label htmlFor="custom-message">Bericht</Label>
                      <Textarea id="custom-message" className="mt-1 min-h-40" maxLength={20000} value={customMessage} onChange={(event) => setCustomMessage(event.target.value)} placeholder="Typ hier uw bericht..." />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="change-type">Wijziging</Label>
                        <Select value={changeType} onValueChange={(value) => setChangeType(value as ChangeType)}>
                          <SelectTrigger id="change-type" className="mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="new">Nieuw toegevoegd</SelectItem>
                            <SelectItem value="removed">Gaat uit het aanbod</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="item-name">Naam {templateLabels[mailTemplate].toLowerCase()}</Label>
                        <Input id="item-name" className="mt-1" maxLength={160} value={itemName} onChange={(event) => setItemName(event.target.value)} placeholder={`Naam van ${templateLabels[mailTemplate].toLowerCase()}`} />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="item-details">Toelichting (optioneel)</Label>
                      <Textarea id="item-details" className="mt-1 min-h-28" maxLength={5000} value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Vertel kort wat klanten hierover moeten weten." />
                    </div>
                    <div>
                      <Label htmlFor="item-url">Link naar website (optioneel)</Label>
                      <Input id="item-url" className="mt-1" type="url" value={itemUrl} onChange={(event) => setItemUrl(event.target.value)} placeholder="https://overweel3d.gijsoverweel.nl/..." />
                    </div>
                  </>
                )}

                <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    Ontvangers: <strong className="text-foreground">{mailTemplate === "custom" && mailAudience === "all_customers" ? "alle klanten" : `${activeCount} actieve nieuwsbriefabonnees`}</strong>
                  </p>
                  <Button disabled={!canPrepareCampaign || sendingCampaign} onClick={() => setSendConfirmOpen(true)}>
                    {sendingCampaign ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Mail versturen
                  </Button>
                </div>
              </div>
            </div>
          </section>

          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <Users className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm text-muted-foreground">Actieve inschrijvingen</p>
                  <p className="text-2xl font-bold text-primary">{activeCount}</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Mail className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm text-muted-foreground">Totaal bewaard</p>
                  <p className="text-2xl font-bold text-primary">{subscriptions.length}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-6 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Zoek nieuwsbriefinschrijvingen"
                className="pl-10"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Zoek op e-mailadres of bron..."
                value={search}
              />
            </div>
            <Select onValueChange={(value) => setStatusFilter(value as StatusFilter)} value={statusFilter}>
              <SelectTrigger aria-label="Filter op inschrijfstatus" className="w-full sm:w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Actief</SelectItem>
                <SelectItem value="inactive">Uitgeschreven</SelectItem>
                <SelectItem value="all">Alle inschrijvingen</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 aria-label="Inschrijvingen laden" className="h-8 w-8 animate-spin text-accent" />
            </div>
          ) : loadError ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-12 text-center">
              <p className="mb-4 text-destructive">{loadError}</p>
              <Button onClick={() => void fetchSubscriptions()} variant="outline">Opnieuw proberen</Button>
            </div>
          ) : filteredSubscriptions.length === 0 ? (
            <div className="rounded-2xl border border-border/60 bg-card px-6 py-16 text-center">
              <Mail className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
              <h2 className="mb-1 font-semibold text-primary">Geen inschrijvingen gevonden</h2>
              <p className="text-sm text-muted-foreground">
                {subscriptions.length === 0 ? "Nieuwe aanmeldingen verschijnen hier automatisch." : "Pas uw zoekopdracht of filter aan."}
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-left">
                      <th className="p-4 font-medium text-muted-foreground">E-mailadres</th>
                      <th className="p-4 font-medium text-muted-foreground">Bron</th>
                      <th className="p-4 font-medium text-muted-foreground">Status</th>
                      <th className="p-4 font-medium text-muted-foreground">Ingeschreven</th>
                      <th className="p-4 text-right font-medium text-muted-foreground">Actie</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSubscriptions.map((subscription) => (
                      <tr className="border-b border-border/70 last:border-0" key={subscription.id}>
                        <td className="p-4 font-medium text-foreground">{subscription.email}</td>
                        <td className="p-4 text-muted-foreground">{sourceLabels[subscription.source] ?? subscription.source}</td>
                        <td className="p-4">
                          <Badge className={subscription.active ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : ""} variant={subscription.active ? "secondary" : "outline"}>
                            {subscription.active ? "Actief" : "Uitgeschreven"}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap p-4 text-muted-foreground">
                          {new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(subscription.subscribed_at))}
                        </td>
                        <td className="p-4 text-right">
                          <Button
                            disabled={updatingId === subscription.id}
                            onClick={() => void toggleSubscription(subscription)}
                            size="sm"
                            variant="outline"
                          >
                            {updatingId === subscription.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : subscription.active ? (
                              <XCircle className="h-4 w-4" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4" />
                            )}
                            {subscription.active ? "Uitschrijven" : "Heractiveren"}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>
      <ConfirmActionDialog
        open={sendConfirmOpen}
        onOpenChange={setSendConfirmOpen}
        title="Mailing definitief versturen?"
        description={mailTemplate === "custom" && mailAudience === "all_customers"
          ? "Dit zelfgeschreven bericht wordt naar alle unieke klantadressen gestuurd. Deze actie kan niet worden teruggedraaid."
          : `Dit bericht wordt naar ${activeCount} actieve nieuwsbriefabonnees gestuurd. Deze actie kan niet worden teruggedraaid.`}
        confirmLabel="Nu versturen"
        onConfirm={sendCampaign}
      />
      <Footer />
    </div>
  );
}
