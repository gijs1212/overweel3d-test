import { useEffect, useState } from "react";
import { createClientId } from "@/lib/clientId";
import { Link } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { uploadFileWithHeicConversion } from "@/lib/imageUploads";
import { validateMediaSelection } from "@/lib/mediaFiles";

interface ProjectMedia { id: string; storage_path: string; original_filename: string; mime_type: string; is_cover: boolean; }
interface Project { id: string; title: string; description: string; is_published: boolean; created_at: string; portfolio_project_media: ProjectMedia[]; }

const mediaUrl = (path: string) => supabase.storage.from("orders").getPublicUrl(path).data.publicUrl;

export default function AdminAssignments() {
  const { isAdmin, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [published, setPublished] = useState(true);
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data, error } = await supabase.from("portfolio_projects" as never).select("id,title,description,is_published,created_at,portfolio_project_media(id,storage_path,original_filename,mime_type,is_cover)").order("created_at", { ascending: false });
    if (error) toast({ title: "Opdrachten laden mislukt", description: error.message, variant: "destructive" });
    else setProjects((data || []) as unknown as Project[]);
    setLoading(false);
  };

  useEffect(() => { if (!authLoading && isAdmin) void load(); else if (!authLoading) setLoading(false); }, [authLoading, isAdmin]);

  const createProject = async () => {
    if (!title.trim() || !files.length) {
      toast({ title: "Titel en media zijn verplicht", description: "Voeg minimaal één afbeelding of video toe.", variant: "destructive" });
      return;
    }
    setSaving(true);
    let projectId: string | null = null;
    try {
      const { data, error } = await supabase.from("portfolio_projects" as never).insert({ title: title.trim(), description: description.trim(), is_published: published } as never).select("id").single();
      if (error) throw error;
      projectId = (data as { id: string }).id;
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const safeName = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-");
        const uploaded = await uploadFileWithHeicConversion("orders", `portfolio/${projectId}/${createClientId()}-${safeName}`, file, { upsert: false });
        if (uploaded.error) throw uploaded.error;
        const { error: mediaError } = await supabase.from("portfolio_project_media" as never).insert({ project_id: projectId, storage_path: uploaded.path, original_filename: uploaded.file.name, mime_type: uploaded.file.type || "application/octet-stream", file_size: uploaded.file.size, is_cover: index === 0, sort_order: index } as never);
        if (mediaError) { await supabase.storage.from("orders").remove([uploaded.path]); throw mediaError; }
      }
      setTitle(""); setDescription(""); setFiles([]); setPublished(true);
      toast({ title: "Opdracht toegevoegd", description: published ? "De opdracht staat direct openbaar." : "De opdracht is als concept opgeslagen." });
      await load();
    } catch (error) {
      if (projectId) await supabase.from("portfolio_projects" as never).delete().eq("id", projectId);
      toast({ title: "Opslaan mislukt", description: error instanceof Error ? error.message : "Onbekende fout", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const togglePublished = async (project: Project) => {
    const { error } = await supabase.from("portfolio_projects" as never).update({ is_published: !project.is_published } as never).eq("id", project.id);
    if (error) toast({ title: "Wijzigen mislukt", description: error.message, variant: "destructive" }); else await load();
  };

  const removeProject = async (project: Project) => {
    if (!window.confirm(`Opdracht “${project.title}” inclusief media verwijderen?`)) return;
    const paths = project.portfolio_project_media.map((media) => media.storage_path);
    const { error } = await supabase.from("portfolio_projects" as never).delete().eq("id", project.id);
    if (error) toast({ title: "Verwijderen mislukt", description: error.message, variant: "destructive" });
    else { if (paths.length) await supabase.storage.from("orders").remove(paths); await load(); toast({ title: "Opdracht verwijderd" }); }
  };

  if (authLoading || loading) return <div className="min-h-screen bg-neutral-100"><Navbar /><main className="flex min-h-[65vh] items-center justify-center pt-20"><Loader2 className="h-8 w-8 animate-spin" /></main><Footer /></div>;
  if (!isAdmin) return <div className="min-h-screen"><Navbar /><main className="flex min-h-[65vh] items-center justify-center pt-20"><h1 className="text-2xl font-bold">Geen toegang</h1></main><Footer /></div>;

  return <div className="min-h-screen bg-neutral-100"><Navbar /><main className="pb-20 pt-20"><div className="container mx-auto max-w-6xl px-4 py-8">
    <Link to="/admin" className="mb-5 inline-flex items-center gap-2 text-sm text-black/55 hover:text-black"><ArrowLeft className="h-4 w-4" /> Terug naar dashboard</Link>
    <header className="mb-6 rounded-2xl bg-black px-6 py-8 text-white md:px-10"><p className="text-[11px] font-bold uppercase tracking-[.22em] text-white/45">Websitecontent</p><h1 className="mt-2 text-3xl font-semibold">Opdrachten beheren</h1><p className="mt-3 text-sm text-white/55">Upload uitgevoerd werk voor de openbare portfolio-pagina.</p></header>
    <div className="grid gap-6 lg:grid-cols-[400px_minmax(0,1fr)]">
      <section className="h-fit rounded-2xl border border-black/10 bg-white p-6"><h2 className="text-lg font-semibold">Nieuwe opdracht</h2>
        <div className="mt-5 space-y-4"><div><Label>Titel</Label><Input className="mt-2" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Bijv. Roos op maat" /></div><div><Label>Omschrijving</Label><Textarea className="mt-2" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Korte toelichting (optioneel)" /></div>
          <div><Label>Afbeeldingen of video’s</Label><label className="mt-2 flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-black/15 bg-neutral-50 p-6 text-center hover:border-black/35"><ImagePlus className="mb-2 h-5 w-5" /><span className="text-sm font-medium">Kies meerdere bestanden</span><span className="mt-1 text-xs text-muted-foreground">De eerste wordt de omslag</span><input type="file" multiple accept="image/*,video/*,.heic,.heif,.mov,.m4v" className="hidden" onChange={(event) => { const selection = validateMediaSelection(Array.from(event.currentTarget.files || []), { allowVideos: true, maxFiles: 20 }); event.currentTarget.value = ""; setFiles(selection.accepted.map(({ file }) => file)); if (selection.errors.length) toast({ title: "Enkele bestanden zijn overgeslagen", description: selection.errors[0], variant: "destructive" }); }} /></label>{files.length > 0 && <p className="mt-2 text-sm text-muted-foreground">{files.length} bestand(en) gekozen</p>}</div>
          <div className="flex items-center justify-between rounded-xl border border-black/10 p-3"><div><p className="text-sm font-medium">Direct openbaar</p><p className="text-xs text-muted-foreground">Tonen op Opdrachten</p></div><Switch checked={published} onCheckedChange={setPublished} /></div>
          <Button className="w-full" onClick={createProject} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Opdracht uploaden</Button>
        </div>
      </section>
      <section className="rounded-2xl border border-black/10 bg-white p-6"><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-semibold">Alle opdrachten</h2><span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold">{projects.length}</span></div>
        {projects.length === 0 ? <p className="rounded-xl bg-neutral-50 p-8 text-center text-sm text-muted-foreground">Nog geen opdrachten geüpload.</p> : <div className="grid gap-4 sm:grid-cols-2">{projects.map((project) => { const cover = project.portfolio_project_media.find((item) => item.is_cover) || project.portfolio_project_media[0]; return <article key={project.id} className="overflow-hidden rounded-xl border border-black/10">{cover && (cover.mime_type.startsWith("video/") ? <video src={mediaUrl(cover.storage_path)} className="aspect-video w-full object-cover" muted /> : <img src={mediaUrl(cover.storage_path)} alt={project.title} className="aspect-video w-full object-cover" />)}<div className="p-4"><div className="flex items-start justify-between gap-2"><div><h3 className="font-semibold">{project.title}</h3><p className="mt-1 text-xs text-muted-foreground">{project.portfolio_project_media.length} media · {project.is_published ? "Openbaar" : "Verborgen"}</p></div><div className="flex"><Button variant="ghost" size="icon" onClick={() => togglePublished(project)}>{project.is_published ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</Button><Button variant="ghost" size="icon" onClick={() => removeProject(project)}><Trash2 className="h-4 w-4" /></Button></div></div></div></article>; })}</div>}
      </section>
    </div>
  </div></main><Footer /></div>;
}
