import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Loader2, Calendar, Tag, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface BlogPostData {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  meta_description: string;
  tags: string[];
  published_at: string;
  featured_image_url: string | null;
  author_name: string;
}

// Simple markdown to HTML (handles headers, bold, italic, lists, paragraphs, links)
function markdownToHtml(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold text-primary mt-6 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold text-primary mt-8 mb-3">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^\- (.+)$/gm, '<li class="ml-4 list-disc text-foreground/80">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal text-foreground/80">$1</li>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="text-accent underline hover:text-accent/80" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\n\n/g, '</p><p class="text-foreground/80 leading-relaxed mb-4">')
    .replace(/^(?!<[hla]|<li)(.+)$/gm, (match) => {
      if (match.startsWith("<")) return match;
      return match;
    });
}

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<BlogPostData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    const fetchPost = async () => {
      const { data } = await supabase
        .from("blog_posts")
        .select("*")
        .eq("slug", slug)
        .eq("status", "published")
        .single();
      if (data) {
        const p = data as BlogPostData;
        setPost(p);
        document.title = `${p.title} | Overweel3D Blog`;
        const meta = document.querySelector('meta[name="description"]');
        if (meta) meta.setAttribute("content", p.meta_description);
      }
      setLoading(false);
    };
    fetchPost();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="pt-20 pb-16 flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="pt-20 pb-16 flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <p className="text-muted-foreground">Artikel niet gevonden.</p>
          <Link to="/blog">
            <Button variant="outline"><ArrowLeft className="w-4 h-4 mr-2" /> Terug naar blog</Button>
          </Link>
        </main>
        <Footer />
      </div>
    );
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.meta_description,
    datePublished: post.published_at,
    author: { "@type": "Organization", name: post.author_name },
    publisher: { "@type": "Organization", name: "Overweel3D" },
    url: `${window.location.origin}/blog/${post.slug}`,
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="pt-20 pb-16">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <article className="container mx-auto px-4 py-12 max-w-3xl">
          <Link to="/blog" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-accent transition-colors mb-8">
            <ArrowLeft className="w-4 h-4" /> Terug naar blog
          </Link>

          <div className="flex items-center gap-3 text-sm text-muted-foreground mb-4">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {new Date(post.published_at).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })}
            </span>
            <span>·</span>
            <span>{post.author_name}</span>
          </div>

          <h1 className="text-3xl md:text-4xl font-bold text-primary mb-6">{post.title}</h1>

          <div className="flex gap-2 flex-wrap mb-8">
            {post.tags?.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 text-xs bg-muted px-2.5 py-1 rounded-full text-muted-foreground">
                <Tag className="w-3 h-3" /> {tag}
              </span>
            ))}
          </div>

          <div
            className="prose prose-lg max-w-none text-foreground/80 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: `<p class="text-foreground/80 leading-relaxed mb-4">${markdownToHtml(post.content)}</p>` }}
          />
        </article>
      </main>
      <Footer />
    </div>
  );
}
