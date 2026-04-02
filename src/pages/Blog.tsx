import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Loader2, Calendar, Tag, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  tags: string[];
  published_at: string;
  featured_image_url: string | null;
  author_name: string;
}

export default function Blog() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Blog | Overweel3D - 3D Print Tips & Nieuws";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Ontdek tips, handleidingen en nieuws over 3D-printen. Leer alles over materialen, technieken en toepassingen.");

    const fetchPosts = async () => {
      const { data } = await supabase
        .from("blog_posts")
        .select("id, title, slug, excerpt, tags, published_at, featured_image_url, author_name")
        .eq("status", "published")
        .order("published_at", { ascending: false });
      setPosts((data as BlogPost[]) || []);
      setLoading(false);
    };
    fetchPosts();
  }, []);

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="pt-20 pb-16">
        <div className="container mx-auto px-4 py-12 max-w-4xl">
          <h1 className="text-4xl font-bold text-primary mb-2">Blog</h1>
          <p className="text-muted-foreground mb-10">Tips, handleidingen en nieuws over 3D-printen</p>

          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-accent" />
            </div>
          ) : posts.length === 0 ? (
            <p className="text-muted-foreground text-center py-20">Nog geen artikelen gepubliceerd.</p>
          ) : (
            <div className="space-y-8">
              {posts.map((post) => (
                <Link
                  key={post.id}
                  to={`/blog/${post.slug}`}
                  className="block group bg-card rounded-2xl p-6 shadow-sm hover:shadow-md transition-all border border-border/50"
                >
                  <div className="flex items-center gap-3 text-sm text-muted-foreground mb-3">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(post.published_at).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })}
                    </span>
                    <span>·</span>
                    <span>{post.author_name}</span>
                  </div>
                  <h2 className="text-xl font-semibold text-primary group-hover:text-accent transition-colors mb-2">
                    {post.title}
                  </h2>
                  <p className="text-muted-foreground mb-4">{post.excerpt}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-2 flex-wrap">
                      {post.tags?.map((tag) => (
                        <span key={tag} className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded-full text-muted-foreground">
                          <Tag className="w-3 h-3" /> {tag}
                        </span>
                      ))}
                    </div>
                    <span className="text-accent text-sm font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
                      Lees meer <ArrowRight className="w-4 h-4" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
