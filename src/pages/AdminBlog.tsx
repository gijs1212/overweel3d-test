import { useCallback, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles, Save, Eye, Trash2, ArrowLeft, Edit, Upload } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  status: string;
  published_at: string | null;
  created_at: string;
  tags: string[];
}

interface EditableBlogPost extends BlogPost {
  content: string;
  meta_description: string;
}

interface ImportedBlogPost {
  title?: string;
  slug?: string;
  excerpt?: string;
  meta_description?: string;
  content?: string;
  tags?: string[] | string;
  status?: string;
}

const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : "Onbekende fout";

export default function AdminBlog() {
  const { isAdmin, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [topic, setTopic] = useState("");
  const [keywords, setKeywords] = useState("");
  const [editingPost, setEditingPost] = useState<EditableBlogPost | null>(null);
  const [saving, setSaving] = useState(false);
  const [importData, setImportData] = useState({ title: "", slug: "", excerpt: "", meta_description: "", content: "", tags: "" });
  const [importing, setImporting] = useState(false);
  const [deletePostId, setDeletePostId] = useState<string | null>(null);
  const [postActionId, setPostActionId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("blog_posts")
      .select("id, title, slug, excerpt, status, published_at, created_at, tags")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Blog laden mislukt", description: error.message, variant: "destructive" });
    } else {
      setPosts((data as BlogPost[]) || []);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    if (!authLoading && isAdmin) void fetchPosts();
    if (!authLoading && !isAdmin) setLoading(false);
  }, [authLoading, fetchPosts, isAdmin]);

  if (authLoading) {
    return (<div className="min-h-screen"><Navbar /><main className="pt-20 pb-16 flex items-center justify-center min-h-[60vh]"><Loader2 aria-label="Toegang controleren" className="w-8 h-8 animate-spin text-accent" /></main><Footer /></div>);
  }

  if (!isAdmin) {
    return (<div className="min-h-screen"><Navbar /><main className="pt-20 pb-16 flex items-center justify-center min-h-[60vh]"><p className="text-muted-foreground">Geen toegang.</p></main><Footer /></div>);
  }

  const handleGenerate = async () => {
    if (!topic.trim()) { toast({ title: "Voer een onderwerp in", variant: "destructive" }); return; }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-blog-post", { body: { topic, keywords } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Artikel gegenereerd! 🎉" });
      setTopic(""); setKeywords(""); setShowGenerator(false);
      fetchPosts();
    } catch (error: unknown) { toast({ title: "Genereren mislukt", description: getErrorMessage(error), variant: "destructive" }); }
    finally { setGenerating(false); }
  };

  const handleImport = async () => {
    if (!importData.title || !importData.content) { toast({ title: "Titel en content zijn verplicht", variant: "destructive" }); return; }
    setImporting(true);
    try {
      const slug = importData.slug || importData.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const { error } = await supabase.from("blog_posts").insert({
        title: importData.title,
        slug,
        excerpt: importData.excerpt || importData.content.substring(0, 200) + "...",
        meta_description: importData.meta_description || importData.excerpt || importData.title,
        content: importData.content,
        tags: importData.tags ? importData.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
        status: "draft",
      });
      if (error) throw error;
      toast({ title: "Blog geïmporteerd! 📝" });
      setImportData({ title: "", slug: "", excerpt: "", meta_description: "", content: "", tags: "" });
      setShowImport(false);
      fetchPosts();
    } catch (error: unknown) { toast({ title: "Import mislukt", description: getErrorMessage(error), variant: "destructive" }); }
    finally { setImporting(false); }
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      try {
        // Try JSON import
        const json = JSON.parse(text) as ImportedBlogPost | ImportedBlogPost[];
        if (Array.isArray(json)) {
          // Bulk import
          handleBulkImport(json);
        } else {
          setImportData({
            title: json.title || "",
            slug: json.slug || "",
            excerpt: json.excerpt || "",
            meta_description: json.meta_description || "",
            content: json.content || "",
            tags: Array.isArray(json.tags) ? json.tags.join(", ") : json.tags || "",
          });
          setShowImport(true);
        }
      } catch {
        // Treat as markdown
        const lines = text.split("\n");
        const title = lines[0]?.replace(/^#\s*/, "") || "Geïmporteerd artikel";
        setImportData({
          title,
          slug: "",
          excerpt: "",
          meta_description: "",
          content: text,
          tags: "",
        });
        setShowImport(true);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleBulkImport = async (articles: ImportedBlogPost[]) => {
    let success = 0;
    for (const article of articles) {
      const slug = article.slug || article.title?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `post-${Date.now()}`;
      const { error } = await supabase.from("blog_posts").insert({
        title: article.title || "Untitled",
        slug,
        excerpt: article.excerpt || (article.content || "").substring(0, 200),
        meta_description: article.meta_description || article.excerpt || article.title || "",
        content: article.content || "",
        tags: Array.isArray(article.tags) ? article.tags : [],
        status: article.status || "draft",
        published_at: article.status === "published" ? new Date().toISOString() : null,
      });
      if (!error) success++;
    }
    toast({ title: `${success}/${articles.length} artikelen geïmporteerd! 📚` });
    fetchPosts();
  };

  const handlePublish = async (postId: string) => {
    setPostActionId(postId);
    const { error } = await supabase.from("blog_posts").update({ status: "published", published_at: new Date().toISOString() }).eq("id", postId);
    if (error) toast({ title: "Publiceren mislukt", description: error.message, variant: "destructive" });
    else { toast({ title: "Gepubliceerd! ✅" }); await fetchPosts(); }
    setPostActionId(null);
  };

  const handleUnpublish = async (postId: string) => {
    setPostActionId(postId);
    const { error } = await supabase.from("blog_posts").update({ status: "draft" }).eq("id", postId);
    if (error) toast({ title: "Terugtrekken mislukt", description: error.message, variant: "destructive" });
    else { toast({ title: "Artikel teruggetrokken" }); await fetchPosts(); }
    setPostActionId(null);
  };

  const handleDelete = async () => {
    if (!deletePostId) return;
    const { error } = await supabase.from("blog_posts").delete().eq("id", deletePostId);
    if (error) toast({ title: "Verwijderen mislukt", description: error.message, variant: "destructive" });
    else { toast({ title: "Artikel verwijderd" }); await fetchPosts(); }
    setDeletePostId(null);
  };

  const openEdit = async (postId: string) => {
    const { data, error } = await supabase.from("blog_posts").select("*").eq("id", postId).single();
    if (data) setEditingPost(data);
    else toast({ title: "Artikel laden mislukt", description: error?.message, variant: "destructive" });
  };

  const saveEdit = async () => {
    if (!editingPost) return;
    setSaving(true);
    const { error } = await supabase.from("blog_posts").update({
      title: editingPost.title, slug: editingPost.slug, excerpt: editingPost.excerpt,
      meta_description: editingPost.meta_description, content: editingPost.content, tags: editingPost.tags,
    }).eq("id", editingPost.id);
    if (!error) { toast({ title: "Opgeslagen! ✅" }); setEditingPost(null); fetchPosts(); }
    else toast({ title: "Opslaan mislukt", variant: "destructive" });
    setSaving(false);
  };

  if (editingPost) {
    return (
      <div className="min-h-screen"><Navbar /><main className="pt-20 pb-16">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <Button variant="ghost" size="sm" onClick={() => setEditingPost(null)} className="mb-6"><ArrowLeft className="w-4 h-4 mr-1" /> Terug</Button>
          <h1 className="text-2xl font-bold text-primary mb-6">Artikel bewerken</h1>
          <div className="space-y-4">
            <div><Label>Titel</Label><Input value={editingPost.title} onChange={(e) => setEditingPost({ ...editingPost, title: e.target.value })} /></div>
            <div><Label>Slug</Label><Input value={editingPost.slug} onChange={(e) => setEditingPost({ ...editingPost, slug: e.target.value })} /></div>
            <div><Label>Excerpt</Label><Textarea value={editingPost.excerpt} onChange={(e) => setEditingPost({ ...editingPost, excerpt: e.target.value })} rows={2} /></div>
            <div><Label>Meta description</Label><Textarea value={editingPost.meta_description} onChange={(e) => setEditingPost({ ...editingPost, meta_description: e.target.value })} rows={2} /></div>
            <div><Label>Tags (komma-gescheiden)</Label><Input value={editingPost.tags?.join(", ") || ""} onChange={(e) => setEditingPost({ ...editingPost, tags: e.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} /></div>
            <div><Label>Content (Markdown)</Label><Textarea value={editingPost.content} onChange={(e) => setEditingPost({ ...editingPost, content: e.target.value })} rows={20} className="font-mono text-sm" /></div>
            <Button onClick={saveEdit} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Opslaan</Button>
          </div>
        </div>
      </main><Footer /></div>
    );
  }

  return (
    <div className="min-h-screen"><Navbar /><main className="pt-20 pb-16">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}><ArrowLeft className="w-4 h-4" /> Terug</Button>
            <h1 className="text-2xl font-bold text-primary">Blog beheer</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowGenerator(!showGenerator)}><Sparkles className="w-4 h-4" /> AI Genereren</Button>
            <Button variant="outline" onClick={() => setShowImport(!showImport)}><Upload className="w-4 h-4" /> Importeren</Button>
            <input ref={fileInputRef} type="file" accept=".json,.md,.txt" onChange={handleFileImport} className="hidden" />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}><Upload className="w-4 h-4" /> Bestand</Button>
          </div>
        </div>

        {showGenerator && (
          <div className="bg-card rounded-2xl p-6 shadow-sm border border-border/50 mb-8">
            <h3 className="font-semibold text-primary mb-4 flex items-center gap-2"><Sparkles className="w-5 h-5 text-accent" /> AI Genereren</h3>
            <div className="space-y-4">
              <div><Label>Onderwerp *</Label><Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="bijv. De beste materialen voor 3D-geprinte prototypes" /></div>
              <div><Label>Zoekwoorden (optioneel)</Label><Input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="bijv. 3D printen, PLA, PETG" /></div>
              <Button onClick={handleGenerate} disabled={generating}>{generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} {generating ? "Bezig..." : "Genereer"}</Button>
            </div>
          </div>
        )}

        {showImport && (
          <div className="bg-card rounded-2xl p-6 shadow-sm border border-border/50 mb-8">
            <h3 className="font-semibold text-primary mb-4 flex items-center gap-2"><Upload className="w-5 h-5 text-accent" /> Blog importeren</h3>
            <div className="space-y-4">
              <div><Label>Titel *</Label><Input value={importData.title} onChange={(e) => setImportData({ ...importData, title: e.target.value })} /></div>
              <div><Label>Slug (optioneel)</Label><Input value={importData.slug} onChange={(e) => setImportData({ ...importData, slug: e.target.value })} placeholder="wordt-automatisch-gegenereerd" /></div>
              <div><Label>Excerpt</Label><Textarea value={importData.excerpt} onChange={(e) => setImportData({ ...importData, excerpt: e.target.value })} rows={2} /></div>
              <div><Label>Meta description</Label><Textarea value={importData.meta_description} onChange={(e) => setImportData({ ...importData, meta_description: e.target.value })} rows={2} /></div>
              <div><Label>Tags (komma-gescheiden)</Label><Input value={importData.tags} onChange={(e) => setImportData({ ...importData, tags: e.target.value })} /></div>
              <div><Label>Content (Markdown) *</Label><Textarea value={importData.content} onChange={(e) => setImportData({ ...importData, content: e.target.value })} rows={15} className="font-mono text-sm" /></div>
              <div className="flex gap-2">
                <Button onClick={handleImport} disabled={importing}>{importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Importeren als concept</Button>
                <Button variant="ghost" onClick={() => setShowImport(false)}>Annuleren</Button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>
        ) : posts.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-muted-foreground mb-4">Nog geen blogartikelen.</p>
            <Button onClick={() => setShowGenerator(true)}><Sparkles className="w-4 h-4" /> Eerste artikel genereren</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {posts.map((post) => (
              <div key={post.id} className="bg-card rounded-xl p-4 shadow-sm border border-border/50 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${post.status === "published" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"}`}>
                      {post.status === "published" ? "Gepubliceerd" : "Concept"}
                    </span>
                    <span className="text-xs text-muted-foreground">{new Date(post.created_at).toLocaleDateString("nl-NL")}</span>
                  </div>
                  <h3 className="font-medium text-primary truncate">{post.title}</h3>
                  <p className="text-sm text-muted-foreground truncate">{post.excerpt}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(post.id)} disabled={postActionId === post.id}><Edit className="w-4 h-4" /></Button>
                  {post.status === "draft" ? (
                    <Button variant="ghost" size="sm" onClick={() => handlePublish(post.id)} disabled={postActionId === post.id} className="text-green-600">
                      {postActionId === post.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => handleUnpublish(post.id)} disabled={postActionId === post.id} className="text-yellow-600">
                      {postActionId === post.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setDeletePostId(post.id)} disabled={postActionId === post.id}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <ConfirmActionDialog
          open={deletePostId !== null}
          onOpenChange={(open) => !open && setDeletePostId(null)}
          title="Artikel verwijderen?"
          description="Dit artikel wordt definitief uit het blog verwijderd. Deze actie kan niet ongedaan worden gemaakt."
          confirmLabel="Artikel verwijderen"
          destructive
          onConfirm={handleDelete}
        />
      </div>
    </main><Footer /></div>
  );
}
