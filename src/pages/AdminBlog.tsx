import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Sparkles, Save, Eye, Trash2, ArrowLeft, Edit } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

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

export default function AdminBlog() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  const [topic, setTopic] = useState("");
  const [keywords, setKeywords] = useState("");
  const [editingPost, setEditingPost] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchPosts = async () => {
    const { data } = await supabase
      .from("blog_posts")
      .select("id, title, slug, excerpt, status, published_at, created_at, tags")
      .order("created_at", { ascending: false });
    setPosts((data as BlogPost[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchPosts(); }, []);

  if (!isAdmin) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="pt-20 pb-16 flex items-center justify-center min-h-[60vh]">
          <p className="text-muted-foreground">Geen toegang.</p>
        </main>
        <Footer />
      </div>
    );
  }

  const handleGenerate = async () => {
    if (!topic.trim()) {
      toast({ title: "Voer een onderwerp in", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-blog-post", {
        body: { topic, keywords },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Artikel gegenereerd! 🎉", description: "Het staat als concept klaar." });
      setTopic("");
      setKeywords("");
      setShowGenerator(false);
      fetchPosts();
    } catch (error: any) {
      toast({ title: "Genereren mislukt", description: error.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handlePublish = async (postId: string) => {
    const { error } = await supabase
      .from("blog_posts")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", postId);
    if (error) {
      toast({ title: "Publiceren mislukt", variant: "destructive" });
    } else {
      toast({ title: "Gepubliceerd! ✅" });
      fetchPosts();
    }
  };

  const handleUnpublish = async (postId: string) => {
    const { error } = await supabase
      .from("blog_posts")
      .update({ status: "draft" })
      .eq("id", postId);
    if (!error) {
      toast({ title: "Teruggetrokken" });
      fetchPosts();
    }
  };

  const handleDelete = async (postId: string) => {
    if (!confirm("Weet je zeker dat je dit artikel wilt verwijderen?")) return;
    const { error } = await supabase.from("blog_posts").delete().eq("id", postId);
    if (!error) {
      toast({ title: "Verwijderd" });
      fetchPosts();
    }
  };

  const openEdit = async (postId: string) => {
    const { data } = await supabase.from("blog_posts").select("*").eq("id", postId).single();
    if (data) setEditingPost(data);
  };

  const saveEdit = async () => {
    if (!editingPost) return;
    setSaving(true);
    const { error } = await supabase
      .from("blog_posts")
      .update({
        title: editingPost.title,
        slug: editingPost.slug,
        excerpt: editingPost.excerpt,
        meta_description: editingPost.meta_description,
        content: editingPost.content,
        tags: editingPost.tags,
      })
      .eq("id", editingPost.id);
    if (error) {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    } else {
      toast({ title: "Opgeslagen! ✅" });
      setEditingPost(null);
      fetchPosts();
    }
    setSaving(false);
  };

  if (editingPost) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="pt-20 pb-16">
          <div className="container mx-auto px-4 py-8 max-w-4xl">
            <Button variant="ghost" size="sm" onClick={() => setEditingPost(null)} className="mb-6">
              <ArrowLeft className="w-4 h-4 mr-1" /> Terug
            </Button>
            <h1 className="text-2xl font-bold text-primary mb-6">Artikel bewerken</h1>
            <div className="space-y-4">
              <div>
                <Label>Titel</Label>
                <Input value={editingPost.title} onChange={(e) => setEditingPost({ ...editingPost, title: e.target.value })} />
              </div>
              <div>
                <Label>Slug</Label>
                <Input value={editingPost.slug} onChange={(e) => setEditingPost({ ...editingPost, slug: e.target.value })} />
              </div>
              <div>
                <Label>Excerpt</Label>
                <Textarea value={editingPost.excerpt} onChange={(e) => setEditingPost({ ...editingPost, excerpt: e.target.value })} rows={2} />
              </div>
              <div>
                <Label>Meta description</Label>
                <Textarea value={editingPost.meta_description} onChange={(e) => setEditingPost({ ...editingPost, meta_description: e.target.value })} rows={2} />
              </div>
              <div>
                <Label>Tags (komma-gescheiden)</Label>
                <Input
                  value={editingPost.tags?.join(", ") || ""}
                  onChange={(e) => setEditingPost({ ...editingPost, tags: e.target.value.split(",").map((t: string) => t.trim()).filter(Boolean) })}
                />
              </div>
              <div>
                <Label>Content (Markdown)</Label>
                <Textarea
                  value={editingPost.content}
                  onChange={(e) => setEditingPost({ ...editingPost, content: e.target.value })}
                  rows={20}
                  className="font-mono text-sm"
                />
              </div>
              <Button onClick={saveEdit} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Opslaan
              </Button>
            </div>
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
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => window.history.back()}>
                <ArrowLeft className="w-4 h-4" /> Terug
              </Button>
              <h1 className="text-2xl font-bold text-primary">Blog beheer</h1>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowGenerator(!showGenerator)}>
                <Sparkles className="w-4 h-4" /> AI Genereren
              </Button>
            </div>
          </div>

          {showGenerator && (
            <div className="bg-card rounded-2xl p-6 shadow-sm border border-border/50 mb-8">
              <h3 className="font-semibold text-primary mb-4 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-accent" /> Artikel genereren met AI
              </h3>
              <div className="space-y-4">
                <div>
                  <Label>Onderwerp *</Label>
                  <Input
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="bijv. De beste materialen voor 3D-geprinte prototypes"
                  />
                </div>
                <div>
                  <Label>Zoekwoorden (optioneel)</Label>
                  <Input
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    placeholder="bijv. 3D printen, PLA, PETG, prototype"
                  />
                </div>
                <Button onClick={handleGenerate} disabled={generating}>
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {generating ? "Bezig met genereren..." : "Genereer artikel"}
                </Button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-accent" />
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-muted-foreground mb-4">Nog geen blogartikelen.</p>
              <Button onClick={() => setShowGenerator(true)}>
                <Sparkles className="w-4 h-4" /> Eerste artikel genereren
              </Button>
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
                      <span className="text-xs text-muted-foreground">
                        {new Date(post.created_at).toLocaleDateString("nl-NL")}
                      </span>
                    </div>
                    <h3 className="font-medium text-primary truncate">{post.title}</h3>
                    <p className="text-sm text-muted-foreground truncate">{post.excerpt}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(post.id)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    {post.status === "draft" ? (
                      <Button variant="ghost" size="sm" onClick={() => handlePublish(post.id)} className="text-green-600">
                        <Eye className="w-4 h-4" />
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => handleUnpublish(post.id)} className="text-yellow-600">
                        <Eye className="w-4 h-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(post.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
