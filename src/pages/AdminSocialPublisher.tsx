import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, ExternalLink, ImagePlus, Loader2, Pause, Play, RefreshCw, RotateCcw, Save, Send, Shuffle, X, XCircle } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { uploadFileWithHeicConversion } from "@/lib/imageUploads";
import { getProductPhotoUrl, normalizeProductStoragePath } from "@/lib/productPhotos";
import { createClientId } from "@/lib/clientId";

type Platform = "facebook" | "instagram";
type PostType = "product" | "color" | "discount" | "spotlight";
type Templates = Record<PostType, Record<Platform, string>>;

const DEFAULT_TEMPLATES: Templates = {
  product: {
    facebook: "{direct_url}\n\nNieuw bij Overweel3D: {name} ✨\n\nBekijk dit nieuwe product en stel het samen.\n\n#Overweel3D #3Dprinten #Nieuw\n\nhttps://overweel3d.gijsoverweel.nl/",
    instagram: "{direct_url}\n\nNieuw bij Overweel3D: {name} ✨\n\nBekijk dit nieuwe product en stel het samen.\n\n#Overweel3D #3Dprinten #Nieuw\n\nhttps://overweel3d.gijsoverweel.nl/",
  },
  color: {
    facebook: "{direct_url}\n\nNieuwe kleur bij Overweel3D: {name} ({material}) 🎨\n\nBekijk de kleur in ons assortiment.\n\n#Overweel3D #3Dprinten #NieuweKleur\n\nhttps://overweel3d.gijsoverweel.nl/",
    instagram: "{direct_url}\n\nNieuwe kleur bij Overweel3D: {name} ({material}) 🎨\n\nBekijk de kleur in ons assortiment.\n\n#Overweel3D #3Dprinten #NieuweKleur\n\nhttps://overweel3d.gijsoverweel.nl/",
  },
  discount: {
    facebook: "{direct_url}\n\nNieuwe korting bij Overweel3D: {discount_label}\nGebruik code {code}. Geldig tot {expires_label}; {usage_label}.\n\n#Overweel3D #Korting\n\nhttps://overweel3d.gijsoverweel.nl/",
    instagram: "{direct_url}\n\nNieuwe korting bij Overweel3D: {discount_label}\nGebruik code {code}. Geldig tot {expires_label}; {usage_label}.\n\n#Overweel3D #Korting\n\nhttps://overweel3d.gijsoverweel.nl/",
  },
  spotlight: {
    facebook: "{direct_url}\n\nUitgelicht bij Overweel3D: {name} ✨\n\nBekijk dit product in onze catalogus.\n\n#Overweel3D #3Dprinten #Uitgelicht\n\nhttps://overweel3d.gijsoverweel.nl/",
    instagram: "{direct_url}\n\nUitgelicht bij Overweel3D: {name} ✨\n\nBekijk dit product in onze catalogus.\n\n#Overweel3D #3Dprinten #Uitgelicht\n\nhttps://overweel3d.gijsoverweel.nl/",
  },
};

interface SettingsRecord {
  id: string;
  enabled: boolean;
  dry_run: boolean;
  spotlight_enabled: boolean;
  integration_token: string;
  control_url: string;
  discount_image_path: string;
  paused_platforms: Platform[];
  templates: Templates;
  spotlight_next_at?: string | null;
  publisher_last_seen_at?: string | null;
  publisher_version?: string;
}

interface JobRecord {
  id: string;
  source_name: string;
  source_type: string;
  status: string;
  is_backfill: boolean;
  attempts: number;
  last_error?: string;
  platform_state?: Record<Platform, string>;
  created?: string;
}

interface SessionRecord {
  id: string;
  platform: Platform;
  status: string;
  last_checked_at?: string;
  last_error?: string;
  screenshot_path?: string;
  account_name?: string;
  account_url?: string;
  check_steps?: string[];
}

interface PublisherHeartbeat {
  lastSeen: string;
  version: string;
  readFailed: boolean;
}

interface NextPublication {
  state: "scheduled" | "processing" | "paused" | "dry_run" | "waiting_for_media" | "none";
  source_name: string;
  source_type: string;
  scheduled_at: string | null;
  platforms: Platform[];
  is_backfill: boolean;
}

interface UploadedCustomImage {
  name: string;
  path: string;
  previewUrl: string;
}

const statusStyle: Record<string, string> = {
  completed: "bg-emerald-100 text-emerald-900", published: "bg-emerald-100 text-emerald-900",
  queued: "bg-blue-100 text-blue-900", processing: "bg-blue-100 text-blue-900", waiting_for_media: "bg-amber-100 text-amber-900",
  manual_attention: "bg-red-100 text-red-900", failed: "bg-red-100 text-red-900", cancelled: "bg-neutral-200 text-neutral-700",
  dry_run_complete: "bg-violet-100 text-violet-900",
};

export default function AdminSocialPublisher() {
  const navigate = useNavigate();
  const { section } = useParams<{ section?: string }>();
  const activeTab = section === "account" || section === "accounts" ? "accounts"
    : ["queue", "templates", "media"].includes(section || "") ? section! : "now";
  const selectTab = (tab: string) => navigate(`/admin/social/${tab === "accounts" ? "account" : tab}`);
  const { isAdmin, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [settings, setSettings] = useState<SettingsRecord | null>(null);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingEnabled, setTogglingEnabled] = useState(false);
  const [nextPublication, setNextPublication] = useState<NextPublication | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [postMode, setPostMode] = useState<"random" | "custom">("random");
  const [customText, setCustomText] = useState("");
  const [customImages, setCustomImages] = useState<UploadedCustomImage[]>([]);
  const [uploadingCustom, setUploadingCustom] = useState(false);
  const [customUploadStatus, setCustomUploadStatus] = useState("");
  const [backfilling, setBackfilling] = useState(false);
  const [targetPlatforms, setTargetPlatforms] = useState<Platform[]>(["facebook", "instagram"]);
  const [placing, setPlacing] = useState(false);
  const [testingAccounts, setTestingAccounts] = useState(false);
  const [accountTestSteps, setAccountTestSteps] = useState<string[]>([]);
  const [publisherHeartbeat, setPublisherHeartbeat] = useState<PublisherHeartbeat>({ lastSeen: "", version: "", readFailed: false });
  const [pairingCode, setPairingCode] = useState("");
  const [pairingContainer, setPairingContainer] = useState(false);

  const refreshPublisherHeartbeat = useCallback(async () => {
    const result = await supabase.rpc("social_publisher_status");
    if (result.error) {
      setPublisherHeartbeat((current) => ({ ...current, readFailed: true }));
      return { lastSeen: "", version: "" };
    }
    const lastSeen = String(result.data?.publisher_last_seen_at || "");
    const version = String(result.data?.publisher_version || "");
    setPublisherHeartbeat({
      lastSeen,
      version,
      readFailed: false,
    });
    return { lastSeen, version };
  }, []);

  const refreshNextPublication = useCallback(async () => {
    const result = await supabase.rpc("social_publisher_next_post");
    if (!result.error) setNextPublication(result.data as NextPublication);
  }, []);

  const load = useCallback(async () => {
    const [settingsResult, jobsResult, sessionsResult, nextResult] = await Promise.all([
      supabase.rpc("get_social_publisher_settings"),
      supabase.from("social_post_jobs").select("*").order("scheduled_at", { ascending: false }).limit(100),
      supabase.from("social_publisher_sessions").select("*").order("platform"),
      supabase.rpc("social_publisher_next_post"),
    ]);
    const error = settingsResult.error || jobsResult.error || sessionsResult.error;
    if (error) {
      toast({ title: "Social Publisher laden mislukt", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    let current = settingsResult.data as SettingsRecord | null;
    if (current) {
      const savedTemplates = current.templates || DEFAULT_TEMPLATES;
      current = {
        ...current,
        templates: (Object.keys(DEFAULT_TEMPLATES) as PostType[]).reduce((result, type) => ({ ...result, [type]: {
          facebook: savedTemplates[type]?.facebook || DEFAULT_TEMPLATES[type].facebook,
          instagram: savedTemplates[type]?.instagram || DEFAULT_TEMPLATES[type].instagram,
        } }), {} as Templates),
        paused_platforms: (current.paused_platforms || []).filter((platform) => platform === "facebook" || platform === "instagram"),
      };
    }
    setSettings(current);
    setPublisherHeartbeat({
      lastSeen: String(current?.publisher_last_seen_at || ""),
      version: String(current?.publisher_version || ""),
      readFailed: false,
    });
    setJobs((jobsResult.data || []) as JobRecord[]);
    if (!nextResult.error) setNextPublication(nextResult.data as NextPublication);
    setSessions(((sessionsResult.data || []) as SessionRecord[]).filter((session) => session.platform === "facebook" || session.platform === "instagram"));
    if (current?.discount_image_path) setPreviewUrl(await getProductPhotoUrl(current.discount_image_path));
    else setPreviewUrl("");
    setLoading(false);
  }, [toast]);

  useEffect(() => { if (isAdmin) void load(); }, [isAdmin, load]);
  useEffect(() => {
    if (!isAdmin) return undefined;
    const timer = window.setInterval(() => {
      void refreshPublisherHeartbeat();
      void refreshNextPublication();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [isAdmin, refreshPublisherHeartbeat, refreshNextPublication]);

  const toggleEnabled = async (enabled: boolean) => {
    if (!settings || togglingEnabled) return;
    const previous = settings.enabled;
    setSettings((current) => current ? { ...current, enabled } : current);
    setTogglingEnabled(true);
    const result = await supabase.rpc("set_social_publisher_enabled", { p_enabled: enabled });
    setTogglingEnabled(false);
    if (result.error) {
      setSettings((current) => current ? { ...current, enabled: previous } : current);
      toast({ title: "Automatisering wijzigen mislukt", description: result.error.message, variant: "destructive" });
    } else {
      void refreshNextPublication();
      toast({ title: enabled ? "Automatisering actief" : "Automatisering gepauzeerd", description: "Deze keuze is direct opgeslagen en blijft na herladen behouden." });
    }
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    const { error } = await supabase.from("social_publisher_settings").update({
      enabled: settings.enabled, dry_run: settings.dry_run, spotlight_enabled: settings.spotlight_enabled,
      integration_token: settings.integration_token, control_url: settings.control_url, discount_image_path: settings.discount_image_path,
      paused_platforms: settings.paused_platforms, templates: settings.templates,
    }).eq("id", settings.id);
    if (!error && !settings.dry_run) {
      await supabase.from("social_post_jobs").update({
        status: "queued", attempts: 0, last_error: "", platform_state: { facebook: "pending", instagram: "pending" },
      }).eq("status", "dry_run_complete");
    }
    setSaving(false);
    toast(error ? { title: "Opslaan mislukt", description: error.message, variant: "destructive" } : { title: "Social Publisher opgeslagen" });
  };

  const pairContainer = async () => {
    if (!settings) return;
    const code = pairingCode.replace(/\s/g, "");
    if (!/^\d{8}$/.test(code)) {
      toast({ title: "Ongeldige koppelcode", description: "Vul de 8 cijfers van de lokale containerpagina in.", variant: "destructive" });
      return;
    }
    let controlUrl = settings.control_url.trim().replace(/\/+$/, "");
    if (/^\d+\.\d+\.\d+\.\d+$/.test(controlUrl)) controlUrl = `http://${controlUrl}:8787`;
    if (!controlUrl) controlUrl = "http://192.168.2.50:8787";
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = settings.integration_token || Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
    const previousHeartbeat = publisherHeartbeat.lastSeen;
    setPairingContainer(true);
    try {
      const result = await supabase.rpc("pair_social_publisher", {
        p_control_url: controlUrl,
        p_pairing_code: code,
        p_integration_token: token,
      });
      if (result.error) throw result.error;
      setSettings({ ...settings, integration_token: token, control_url: controlUrl });
      setPairingCode("");
      let acknowledged = false;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        if (attempt) await new Promise((resolve) => window.setTimeout(resolve, 500));
        const heartbeat = await refreshPublisherHeartbeat();
        acknowledged = Boolean(heartbeat.lastSeen && heartbeat.lastSeen !== previousHeartbeat && /^2\.0\./.test(heartbeat.version));
        if (acknowledged) break;
      }
      if (acknowledged) {
        toast({ title: "Docker-container verbonden", description: "De eerste heartbeat is door PocketBase bevestigd." });
      } else {
        toast({ title: "Container gekoppeld", description: "De heartbeat is nog niet bevestigd. Bekijk de verbindingsfout in het containerdashboard." });
      }
    } catch (error) {
      toast({ title: "Container koppelen mislukt", description: error instanceof Error ? error.message : "Onbekende fout.", variant: "destructive" });
    } finally {
      setPairingContainer(false);
    }
  };

  const togglePause = (platform: Platform) => {
    if (!settings) return;
    const paused = settings.paused_platforms.includes(platform)
      ? settings.paused_platforms.filter((item) => item !== platform)
      : [...settings.paused_platforms, platform];
    setSettings({ ...settings, paused_platforms: paused });
  };

  const uploadDiscountImage = async (file?: File) => {
    if (!file || !settings) return;
    setUploading(true);
    const extension = file.name.split(".").pop() || "jpg";
    const path = `social/discount-template/${createClientId()}.${extension}`;
    const result = await uploadFileWithHeicConversion("orders", path, file, { upsert: false });
    setUploading(false);
    if (result.error) { toast({ title: "Afbeelding uploaden mislukt", description: result.error.message, variant: "destructive" }); return; }
    setSettings({ ...settings, discount_image_path: result.path });
    setPreviewUrl(await getProductPhotoUrl(result.path));
    toast({ title: "Kortingsafbeelding geüpload", description: "Sla de instellingen nog op." });
  };

  const uploadCustomImages = async (files: File[]) => {
    if (!files.length) return;
    if (customImages.length + files.length > 10) {
      toast({ title: "Maximaal 10 afbeeldingen", description: "Kies maximaal tien foto's per bericht.", variant: "destructive" });
      return;
    }
    setUploadingCustom(true);
    const group = createClientId();
    try {
      for (const [index, file] of files.entries()) {
        if (!file.type.startsWith("image/") && !/\.(heic|heif|jpe?g|png|webp)$/i.test(file.name)) throw new Error(`${file.name} is geen ondersteunde afbeelding.`);
        setCustomUploadStatus(`${index + 1} van ${files.length} uploaden: ${file.name}`);
        const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const result = await uploadFileWithHeicConversion("orders", `social/manual/${group}/${index + 1}.${extension}`, file, { upsert: false });
        if (result.error || !result.data) throw result.error || new Error(`Upload van ${file.name} is niet bevestigd.`);
        const previewUrl = URL.createObjectURL(result.file);
        setCustomImages((current) => [...current, { name: file.name, path: result.path, previewUrl }]);
      }
      setCustomUploadStatus(`${files.length} afbeelding${files.length === 1 ? "" : "en"} geüpload en klaar voor het bericht.`);
    } catch (error) {
      setCustomUploadStatus("");
      toast({ title: "Afbeelding uploaden mislukt", description: error instanceof Error ? error.message : "Onbekende fout.", variant: "destructive" });
    } finally {
      setUploadingCustom(false);
    }
  };

  const removeCustomImage = async (image: UploadedCustomImage) => {
    const { error } = await supabase.storage.from("orders").remove([image.path]);
    if (error) {
      toast({ title: "Afbeelding verwijderen mislukt", description: error.message, variant: "destructive" });
      return;
    }
    URL.revokeObjectURL(image.previewUrl);
    setCustomImages((current) => current.filter((item) => item.path !== image.path));
  };

  const enqueueBackfill = async () => {
    if (!window.confirm("Alle bestaande actieve producten en kleuren in de socialmediawachtrij zetten? Ze worden in willekeurige volgorde maximaal één keer per twee uur verwerkt.")) return;
    setBackfilling(true);
    try {
      const { data, error } = await supabase.rpc("enqueue_social_backfill");
      if (error) throw error;
      const added = Number(data?.queued || 0);
      const updated = Number(data?.updated || 0);
      toast({ title: "Bestaande catalogus ingepland", description: `${added} nieuwe en ${updated} bestaande taken in de twee-uurswachtrij. ${Number(data?.waiting_for_media || 0)} producten wachten nog op een foto.` });
      await load();
    } catch (error) {
      toast({ title: "Catalogus inplannen mislukt", description: error instanceof Error ? error.message : "Onbekende fout.", variant: "destructive" });
    } finally {
      setBackfilling(false);
    }
  };

  const updateTemplate = (type: PostType, platform: Platform, value: string) => {
    if (!settings) return;
    setSettings({ ...settings, templates: { ...settings.templates, [type]: { ...settings.templates[type], [platform]: value } } });
  };

  const resetJob = async (job: JobRecord) => {
    const { error } = await supabase.from("social_post_jobs").update({ status: "queued", attempts: 0, last_error: "", platform_state: { facebook: "pending", instagram: "pending" } }).eq("id", job.id);
    if (error) toast({ title: "Opnieuw proberen mislukt", description: error.message, variant: "destructive" }); else void load();
  };

  const cancelJob = async (job: JobRecord) => {
    const { error } = await supabase.from("social_post_jobs").update({ status: "cancelled" }).eq("id", job.id);
    if (error) toast({ title: "Annuleren mislukt", description: error.message, variant: "destructive" }); else void load();
  };

  const toggleTargetPlatform = (platform: Platform) => {
    setTargetPlatforms((current) => current.includes(platform) ? current.filter((item) => item !== platform) : [...current, platform]);
  };

  const testAccountLogins = async () => {
    setTestingAccounts(true);
    setAccountTestSteps(["Controleopdracht naar PocketBase sturen"]);
    try {
      const capability = await supabase.rpc("social_publisher_status");
      if (capability.error) throw capability.error;
      if (String(capability.data?.hook_version || "") !== "1.13.0") {
        throw new Error("Werk eerst de PocketBase-app bij naar 1.13.0; de huidige hook kan de accountcontrole niet afronden.");
      }
      if (String(capability.data?.publisher_version || "") !== "2.2.0") {
        throw new Error("Werk eerst de Social Publisher-container bij naar 2.2.0.");
      }
      const eventId = createClientId();
      const { data, error } = await supabase.from("social_post_jobs").insert({
        event_key: `session-check:${eventId}`,
        source_type: "session_check",
        source_id: eventId,
        source_name: "Facebook- en Instagram-accountcontrole",
        status: "queued",
        priority: 1000,
        scheduled_at: new Date().toISOString(),
        media_paths: [],
        payload: { target_platforms: ["facebook", "instagram"] },
        platform_state: { facebook: "pending", instagram: "pending" },
        attempts: 0,
        is_backfill: false,
      }).select("id,status").single();
      if (error || !data?.id) throw error || new Error("De controleopdracht heeft geen id gekregen.");

      setAccountTestSteps((steps) => [...steps, "Wachten tot de Social Publisher de opdracht oppakt"]);
      for (let attempt = 0; attempt < 75; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        setAccountTestSteps((steps) => [...steps.filter((step) => !step.startsWith("Accountcontrole loopt")), `Accountcontrole loopt · maximaal ${150 - (attempt + 1) * 2} seconden wachten`]);
        const result = await supabase.from("social_post_jobs").select("status,platform_state,last_error").eq("id", data.id).single();
        if (result.error) throw result.error;
        const status = String(result.data?.status || "");
        if (status === "processing" && attempt < 2) {
          setAccountTestSteps((steps) => steps.includes("Meta Graph API wordt gecontroleerd") ? steps : [...steps, "Meta Graph API wordt gecontroleerd"]);
        }
        if (["completed", "manual_attention", "failed", "cancelled"].includes(status)) {
          const state = result.data?.platform_state as Partial<Record<Platform, string>> | undefined;
          const facebook = state?.facebook || "onbekend";
          const instagram = state?.instagram || "onbekend";
          const detail = String(result.data?.last_error || "").trim();
          const connected = status === "completed" && facebook === "connected" && instagram === "connected";
          setAccountTestSteps((steps) => [...steps.filter((step) => !step.startsWith("Accountcontrole loopt")),
            `Facebook-API: ${facebook === "connected" ? "verbonden" : facebook === "manual_attention" ? "controle nodig" : "niet verbonden"}`,
            `Instagram-kanaal: ${instagram === "connected" ? "gekoppeld" : instagram === "manual_attention" ? "niet bevestigd" : "niet gekoppeld"}`,
            ...(detail ? [detail] : []),
          ]);
          await load();
          toast(connected
            ? { title: "Facebook en Instagram verbonden", description: "Beide kanalen zijn door de container gecontroleerd." }
            : { title: "Accountcontrole heeft aandacht nodig", description: detail || "Bekijk de status en het controlescherm hieronder.", variant: "destructive" });
          return;
        }
      }
      throw new Error("De container antwoordde niet binnen 150 seconden. Controleer de containerlogs en PocketBase-hook 1.13.0.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Onbekende fout.";
      setAccountTestSteps((steps) => [...steps, `Controle mislukt: ${message}`]);
      toast({ title: "Accountcontrole mislukt", description: message, variant: "destructive" });
    } finally {
      setTestingAccounts(false);
    }
  };

  const queuePostNow = async () => {
    if (!targetPlatforms.length) { toast({ title: "Kies minstens één platform", variant: "destructive" }); return; }
    if (postMode === "custom" && !customText.trim()) { toast({ title: "Vul eerst de tekst in", variant: "destructive" }); return; }
    if (uploadingCustom) { toast({ title: "Wacht tot de foto's zijn geüpload", variant: "destructive" }); return; }
    if (postMode === "custom" && targetPlatforms.includes("instagram") && !customImages.length) {
      toast({ title: "Instagram heeft een afbeelding nodig", description: "Voeg een foto toe of schakel Instagram voor dit bericht uit.", variant: "destructive" });
      return;
    }
    setPlacing(true);
    try {
      const eventId = createClientId();
      let sourceType: PostType | "manual" = "manual";
      let sourceId = eventId;
      let sourceName = "Handmatig bericht";
      let mediaPaths: string[] = [];
      let payload: Record<string, unknown> = { target_platforms: targetPlatforms };

      if (postMode === "random") {
        const [productsResult, imagesResult] = await Promise.all([
          supabase.from("products").select("*").eq("active", true),
          supabase.from("product_images").select("product_id,storage_path,media_type,is_primary,sort_order"),
        ]);
        if (productsResult.error || imagesResult.error) throw productsResult.error || imagesResult.error;
        const data = productsResult.data;
        const imageRows = imagesResult.data || [];
        const eligible = (data || []).map((product) => {
          const related = imageRows.filter((image) => image.product_id === product.id && String(image.media_type || "").toLowerCase() !== "video")
            .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || Number(a.sort_order) - Number(b.sort_order))
            .map((image) => image.storage_path).filter(Boolean);
          const legacy = Array.isArray(product.photos) ? product.photos.filter((path) => !/\.(mp4|webm|mov|m4v)$/i.test(String(path))) : [];
          return { product, media: [...new Set([...related, ...legacy].map((path) => normalizeProductStoragePath(String(path || ""))).filter(Boolean))].slice(0, 10) as string[] };
        }).filter((entry) => entry.media.length);
        if (!eligible.length) throw new Error("Er is geen actief product met een productfoto beschikbaar.");
        const start = Math.floor(Math.random() * eligible.length);
        let selected: typeof eligible[number] | undefined;
        let selectedMedia: string[] = [];
        for (let offset = 0; offset < eligible.length; offset += 1) {
          const candidate = eligible[(start + offset) % eligible.length];
          const urls = await Promise.all(candidate.media.map((path) => getProductPhotoUrl(path)));
          const valid = candidate.media.filter((_, index) => Boolean(urls[index]));
          if (valid.length) { selected = candidate; selectedMedia = valid; break; }
        }
        if (!selected) throw new Error("Geen productfoto kon uit PocketBase worden geladen.");
        sourceType = "spotlight";
        sourceId = selected.product.id;
        sourceName = selected.product.name;
        mediaPaths = selectedMedia;
        payload = {
          name: selected.product.name,
          direct_url: `https://overweel3d.gijsoverweel.nl/bestellen?product=${encodeURIComponent(selected.product.id)}`,
          target_platforms: targetPlatforms,
        };
      } else {
        mediaPaths = customImages.map((image) => image.path);
        const homepage = "https://overweel3d.gijsoverweel.nl/";
        const text = customText.includes(homepage) ? customText.trim() : `${customText.trim()}\n\n${homepage}`;
        payload = { target_platforms: targetPlatforms, texts: { facebook: text, instagram: text } };
      }

      const states = { facebook: targetPlatforms.includes("facebook") ? "pending" : "skipped", instagram: targetPlatforms.includes("instagram") ? "pending" : "skipped" };
      const { error } = await supabase.from("social_post_jobs").insert({
        event_key: `manual:${eventId}`, source_type: sourceType, source_id: sourceId, source_name: sourceName,
        status: "queued", priority: 200, scheduled_at: new Date().toISOString(), media_paths: mediaPaths,
        payload, platform_state: states, attempts: 0, is_backfill: false,
      });
      if (error) throw error;
      if (postMode === "custom") {
        customImages.forEach((image) => URL.revokeObjectURL(image.previewUrl));
        setCustomText(""); setCustomImages([]); setCustomUploadStatus("");
      }
      toast({ title: settings.dry_run ? "Droogloop staat klaar" : "Bericht staat klaar om nu te plaatsen", description: postMode === "random" ? `${sourceName} is willekeurig gekozen.` : "Het eigen bericht staat bovenaan de wachtrij." });
      await load();
    } catch (error) {
      toast({ title: "Bericht klaarzetten mislukt", description: error instanceof Error ? error.message : "Onbekende fout.", variant: "destructive" });
    } finally { setPlacing(false); }
  };

  const attentionCount = useMemo(() => jobs.filter((job) => ["manual_attention", "waiting_for_media", "failed"].includes(job.status)).length, [jobs]);
  const publisherConnected = Boolean(publisherHeartbeat.lastSeen) && Date.now() - new Date(publisherHeartbeat.lastSeen).getTime() <= 75_000;

  if (authLoading || loading) return <div className="min-h-screen"><Navbar /><main className="flex min-h-[60vh] items-center justify-center pt-20"><Loader2 className="h-8 w-8 animate-spin" /></main><Footer /></div>;
  if (!isAdmin || !settings) return <div className="min-h-screen"><Navbar /><main className="pt-32 text-center">Geen toegang.</main><Footer /></div>;

  return <div className="min-h-screen bg-neutral-100"><Navbar /><main className="container mx-auto max-w-7xl px-4 pb-20 pt-28">
    <div className="mb-7 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div><Link to="/admin" className="mb-3 inline-flex items-center gap-2 text-sm text-black/55"><ArrowLeft className="h-4 w-4" /> Terug naar dashboard</Link><h1 className="text-3xl font-semibold tracking-tight">Social Publisher</h1><p className="mt-2 text-sm text-black/55">Versie 2.2.0 · Publiceert via de officiële Meta Graph API op Facebookpagina Overweel3D en het gekoppelde Instagram-account.</p></div>
      <div className="flex gap-2"><Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4" /> Vernieuwen</Button><Button onClick={save} disabled={saving || togglingEnabled}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Instellingen opslaan</Button></div>
    </div>

    <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      <div className="rounded-2xl border bg-white p-5"><p className="text-xs uppercase tracking-wider text-black/45">Automatisering</p><p className="mt-2 text-xl font-semibold">{settings.enabled ? "Actief" : "Gepauzeerd"}</p><Switch className="mt-4" checked={settings.enabled} disabled={togglingEnabled} onCheckedChange={(enabled) => void toggleEnabled(enabled)} /><p className="mt-2 text-xs text-black/45">Wordt direct opgeslagen.</p></div>
      <div className="rounded-2xl border bg-white p-5"><p className="text-xs uppercase tracking-wider text-black/45">Modus</p><p className="mt-2 text-xl font-semibold">{settings.dry_run ? "Droogloop" : "Live"}</p><Switch className="mt-4" checked={settings.dry_run} onCheckedChange={(dry_run) => setSettings({ ...settings, dry_run })} /></div>
      <div className="rounded-2xl border bg-white p-5"><p className="text-xs uppercase tracking-wider text-black/45">Aandacht nodig</p><p className="mt-2 text-xl font-semibold">{attentionCount}</p></div>
      <div className="rounded-2xl border bg-white p-5"><p className="text-xs uppercase tracking-wider text-black/45">Volgende uitlichting</p><p className="mt-2 text-sm font-semibold">{settings.spotlight_next_at ? new Date(settings.spotlight_next_at).toLocaleString("nl-NL") : "Na eerste containerpoll"}</p><Switch className="mt-4" checked={settings.spotlight_enabled} onCheckedChange={(spotlight_enabled) => setSettings({ ...settings, spotlight_enabled })} /></div>
      <div className="rounded-2xl border bg-white p-5"><p className="text-xs uppercase tracking-wider text-black/45">Docker-container</p><div className="mt-2 flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${publisherConnected ? "bg-emerald-500" : "bg-red-500"}`} /><p className="text-xl font-semibold">{publisherHeartbeat.readFailed ? "Status onbekend" : publisherConnected ? "Verbonden" : "Geen verbinding"}</p></div><p className="mt-2 text-xs text-black/45">{publisherHeartbeat.lastSeen ? `Laatste contact: ${new Date(publisherHeartbeat.lastSeen).toLocaleString("nl-NL")}` : "Nog geen heartbeat ontvangen"}{publisherHeartbeat.version ? ` · v${publisherHeartbeat.version}` : ""}</p>{settings.enabled && !publisherConnected && <p className="mt-3 text-xs text-amber-700">Automatisering blijft actief en probeert over maximaal 30 seconden opnieuw.</p>}</div>
    </div>

    <section className="mb-6 rounded-2xl border bg-white p-5" aria-live="polite">
      <p className="text-xs font-bold uppercase tracking-wider text-black/45">Volgende publicatie</p>
      <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div><h2 className="text-xl font-semibold">{nextPublication?.source_name || "Nog niets ingepland"}</h2><p className="mt-1 text-sm text-black/55">{nextPublication?.source_type === "product" ? "Product" : nextPublication?.source_type === "color" ? "Kleur" : nextPublication?.source_type === "discount" ? "Kortingscode" : nextPublication?.source_type === "spotlight" ? "Productuitlichting" : nextPublication?.source_type === "manual" ? "Eigen bericht" : nextPublication?.source_type === "backfill" ? "Bestaande catalogus" : "Wachtrij leeg"}{nextPublication?.platforms.length ? ` · ${nextPublication.platforms.join(" en ")}` : ""}</p></div>
        <p className="text-sm font-semibold">{nextPublication?.state === "paused" ? "Gepauzeerd — planning wordt hervat zodra je activeert" : nextPublication?.state === "dry_run" ? "Droogloop — wordt nog niet online geplaatst" : nextPublication?.state === "processing" ? "Wordt nu verwerkt" : nextPublication?.state === "waiting_for_media" ? "Wacht op foto of handmatige actie" : nextPublication?.scheduled_at ? new Date(nextPublication.scheduled_at).toLocaleString("nl-NL", { dateStyle: "full", timeStyle: "short" }) : "Nog geen tijd bekend"}</p>
      </div>
      {nextPublication?.scheduled_at && nextPublication.state === "scheduled" && <p className="mt-3 text-xs text-black/45">Verwachte tijd; nieuwe berichten met voorrang of een niet-verbonden container kunnen dit wijzigen.</p>}
    </section>

    <Tabs value={activeTab} onValueChange={selectTab}>
      <TabsList className="mb-5"><TabsTrigger value="now">Nu plaatsen</TabsTrigger><TabsTrigger value="queue">Wachtrij</TabsTrigger><TabsTrigger value="accounts">Accounts & koppeling</TabsTrigger><TabsTrigger value="templates">Teksten</TabsTrigger><TabsTrigger value="media">Kortingsafbeelding</TabsTrigger></TabsList>
      <TabsContent value="now"><section className="rounded-2xl border bg-white p-6"><div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-black/40">Direct publiceren</p><h2 className="mt-1 text-xl font-semibold">Plaats nu een bericht</h2><p className="mt-1 text-sm text-black/50">Nieuwe handmatige berichten krijgen voorrang op de automatische wachtrij.</p></div><div className="flex rounded-full bg-neutral-100 p-1"><Button type="button" size="sm" variant={postMode === "random" ? "default" : "ghost"} className="rounded-full" onClick={() => setPostMode("random")}><Shuffle className="h-4 w-4" /> Willekeurig product</Button><Button type="button" size="sm" variant={postMode === "custom" ? "default" : "ghost"} className="rounded-full" onClick={() => setPostMode("custom")}><Send className="h-4 w-4" /> Eigen tekst</Button></div></div>
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>{postMode === "random" ? <div className="rounded-2xl border border-dashed bg-neutral-50 p-8"><Shuffle className="mb-3 h-7 w-7" /><p className="font-semibold">Willekeurige productuitlichting</p><p className="mt-1 text-sm text-black/50">Er wordt een actief product met foto gekozen. De vaste tekst en directe cataloguslink worden automatisch gebruikt.</p></div> : <div className="space-y-4"><div><Label>Berichttekst</Label><Textarea rows={9} value={customText} onChange={(event) => setCustomText(event.target.value)} placeholder="Schrijf hier het bericht. De link naar de homepage wordt automatisch onderaan toegevoegd." /></div><div><Label>Afbeeldingen (optioneel, verplicht voor Instagram)</Label><label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed p-5 text-sm font-semibold"><ImagePlus className="h-4 w-4" /> {uploadingCustom ? "Uploaden…" : "Afbeeldingen kiezen"}<input type="file" multiple accept="image/*,.heic,.heif" disabled={uploadingCustom} className="hidden" onChange={(event) => { const files = Array.from(event.target.files || []); event.target.value = ""; void uploadCustomImages(files); }} /></label>{customUploadStatus && <p role="status" className="mt-2 text-sm text-black/60">{customUploadStatus}</p>}{customImages.length > 0 && <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">{customImages.map((image) => <div key={image.path} className="relative overflow-hidden rounded-xl border bg-neutral-50"><img src={image.previewUrl} alt={image.name} className="aspect-square w-full object-cover" /><div className="flex items-center justify-between gap-2 p-2"><span className="truncate text-xs" title={image.name}>{image.name}</span><button type="button" disabled={placing || uploadingCustom} aria-label={`${image.name} verwijderen`} onClick={() => void removeCustomImage(image)}><X className="h-4 w-4" /></button></div></div>)}</div>}</div></div>}</div>
          <aside className="rounded-2xl bg-black p-5 text-white"><p className="text-xs font-bold uppercase tracking-[0.16em] text-white/45">Bestemmingen</p><div className="mt-4 space-y-3">{(["facebook", "instagram"] as Platform[]).map((platform) => <label key={platform} className="flex cursor-pointer items-center justify-between rounded-xl border border-white/15 p-3"><span className="capitalize">{platform}{platform === "facebook" ? " · Overweel3D" : ""}</span><Switch checked={targetPlatforms.includes(platform)} onCheckedChange={() => toggleTargetPlatform(platform)} /></label>)}</div><Button className="mt-5 w-full bg-white text-black hover:bg-white/85" onClick={() => void queuePostNow()} disabled={placing || uploadingCustom || !settings.enabled}>{placing || uploadingCustom ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{settings.dry_run ? " Droogloop nu starten" : " Nu plaatsen"}</Button>{!settings.enabled && <p className="mt-3 text-xs text-amber-300">Schakel eerst de automatisering bovenaan in.</p>}</aside>
        </div>
      </section></TabsContent>
      <TabsContent value="queue" className="space-y-3">
        <section className="flex flex-col gap-3 rounded-2xl border bg-white p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">Bestaande producten en kleuren</h2><p className="text-sm text-black/55">Zet alle actieve items één keer in de wachtrij. De volgorde is willekeurig, maximaal één bericht per twee uur. Daarna volgt iedere twee dagen om 19:00 een productuitlichting.</p></div><Button type="button" onClick={() => void enqueueBackfill()} disabled={backfilling}>{backfilling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shuffle className="h-4 w-4" />} Bestaande catalogus inplannen</Button></section>
        {jobs.length === 0 ? <div className="rounded-2xl border bg-white p-10 text-center text-black/45">De wachtrij wordt gevuld zodra de container voor het eerst synchroniseert.</div> : jobs.map((job) => <article key={job.id} className="rounded-2xl border bg-white p-5"><div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{job.source_name}</h2><span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusStyle[job.status] || "bg-neutral-100"}`}>{job.status}</span>{job.is_backfill && <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs">bestaand item · max. 1 per 2 uur</span>}</div><p className="mt-1 text-xs uppercase tracking-wider text-black/40">{job.source_type} · poging {job.attempts || 0}</p>{job.last_error && <p className="mt-3 max-w-3xl text-sm text-red-700">{job.last_error}</p>}<div className="mt-3 flex gap-2">{(["facebook", "instagram"] as Platform[]).map((platform) => <span key={platform} className="rounded-lg border px-2 py-1 text-xs">{platform}: {job.platform_state?.[platform] || "pending"}</span>)}</div></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => void resetJob(job)}><RotateCcw className="h-4 w-4" /> Opnieuw</Button><Button variant="ghost" size="sm" onClick={() => void cancelJob(job)}><XCircle className="h-4 w-4" /> Annuleren</Button></div></div></article>)}
      </TabsContent>
      <TabsContent value="accounts" className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border bg-white p-6"><h2 className="text-lg font-semibold">Containerkoppeling</h2><p className="mt-1 text-sm text-black/50">De geheime sleutel wordt automatisch aangemaakt en naar de container gestuurd.</p><div className="mt-5 space-y-4"><div><Label>Container-IP of lokale beheer-URL</Label><Input value={settings.control_url || ""} onChange={(event) => setSettings({ ...settings, control_url: event.target.value })} placeholder="192.168.2.50" /></div><div><Label>Koppelcode uit de container</Label><Input inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={pairingCode} onChange={(event) => setPairingCode(event.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="8 cijfers" /></div><Button className="w-full" onClick={() => void pairContainer()} disabled={pairingContainer}>{pairingContainer ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Container koppelen</Button>{settings.control_url && <a href={settings.control_url} target="_blank" rel="noreferrer"><Button variant="outline" className="w-full"><ExternalLink className="h-4 w-4" /> Lokale containerpagina openen</Button></a>}</div></section>
        <section className="rounded-2xl border bg-white p-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-lg font-semibold">API-accountcontrole</h2><p className="mt-1 text-sm text-black/50">Controleert met Meta Graph API of de paginatoken bij Overweel3D en het gekoppelde Instagram-account hoort.</p></div><Button onClick={() => void testAccountLogins()} disabled={testingAccounts}>{testingAccounts ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} API-verbinding testen</Button></div>{accountTestSteps.length > 0 && <ol className="mt-5 space-y-2 rounded-xl bg-neutral-50 p-4 text-sm">{accountTestSteps.map((step, index) => <li key={`${step}-${index}`} className="flex gap-2"><span className="font-semibold text-black/35">{index + 1}.</span><span>{step}</span></li>)}</ol>}</section>
        <section className="rounded-2xl border bg-white p-6 lg:col-span-2"><h2 className="text-lg font-semibold">Platformstatus</h2><div className="mt-5 grid gap-3 md:grid-cols-2">{(["facebook", "instagram"] as Platform[]).map((platform) => { const session = sessions.find((item) => item.platform === platform); const paused = settings.paused_platforms.includes(platform); const screenshotName = session?.screenshot_path?.split(/[\\/]/).pop(); const connected = session?.status === "connected"; return <div key={platform} className="rounded-xl border p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-emerald-500" : "bg-neutral-300"}`} /><p className="font-semibold capitalize">{platform}</p></div><p className="mt-1 text-xs text-black/45">{session?.status || "Nog niet gecontroleerd"}{session?.last_checked_at ? ` · ${new Date(session.last_checked_at).toLocaleString("nl-NL")}` : ""}</p></div><Button variant={paused ? "default" : "outline"} size="sm" onClick={() => togglePause(platform)}>{paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}{paused ? " Hervatten" : " Pauzeren"}</Button></div>{session?.account_url && <a className="mt-3 inline-flex items-center gap-1 text-sm font-semibold underline" href={session.account_url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> {session.account_name || `${platform} account`} openen</a>}{session?.last_error && <p className="mt-3 text-sm text-red-700">{session.last_error}</p>}{session?.check_steps && session.check_steps.length > 0 && <details className="mt-3 rounded-lg bg-neutral-50 p-3 text-xs"><summary className="cursor-pointer font-semibold">Uitgevoerde controlestappen</summary><ol className="mt-2 space-y-1">{session.check_steps.map((step, index) => <li key={`${step}-${index}`}>{index + 1}. {step}</li>)}</ol></details>}{screenshotName && settings.control_url && <a className="mt-3 inline-flex items-center gap-1 text-xs font-semibold underline" target="_blank" rel="noreferrer" href={`${settings.control_url.replace(/\/$/, "")}/failures/${encodeURIComponent(screenshotName)}`}><ExternalLink className="h-3 w-3" /> Controlescherm bekijken</a>}</div>; })}</div></section>
      </TabsContent>
      <TabsContent value="templates"><div className="space-y-6">{(Object.keys(DEFAULT_TEMPLATES) as PostType[]).map((type) => <section key={type} className="rounded-2xl border bg-white p-6"><h2 className="mb-4 text-lg font-semibold capitalize">{type}</h2><div className="grid gap-4 lg:grid-cols-2">{(["facebook", "instagram"] as Platform[]).map((platform) => <div key={platform}><div className="mb-2 flex items-center justify-between"><Label className="capitalize">{platform}</Label></div><Textarea rows={10} value={settings.templates[type][platform]} onChange={(event) => updateTemplate(type, platform, event.target.value)} /></div>)}</div><p className="mt-3 text-xs text-black/45">Variabelen: {type === "discount" ? "{direct_url}, {code}, {discount_label}, {expires_label}, {usage_label}" : type === "color" ? "{direct_url}, {name}, {material}" : "{direct_url}, {name}"}</p></section>)}</div></TabsContent>
      <TabsContent value="media"><section className="rounded-2xl border bg-white p-6"><h2 className="text-lg font-semibold">Vaste kortingsafbeelding</h2><p className="mt-1 text-sm text-black/50">Deze afbeelding wordt voor iedere openbare kortingscode gebruikt.</p><div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">{previewUrl ? <img src={previewUrl} alt="Kortingsafbeelding" className="h-44 w-44 rounded-2xl border object-cover" /> : <div className="flex h-44 w-44 items-center justify-center rounded-2xl border border-dashed text-black/35"><ImagePlus /></div>}<label className="cursor-pointer"><input type="file" accept="image/*,.heic,.heif" className="hidden" onChange={(event) => void uploadDiscountImage(event.target.files?.[0])} /><span className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-3 text-sm font-semibold text-white">{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />} Afbeelding kiezen</span></label></div></section></TabsContent>
    </Tabs>
  </main><Footer /></div>;
}
