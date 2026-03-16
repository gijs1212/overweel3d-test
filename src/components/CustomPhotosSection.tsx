import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ImageIcon, Loader2 } from "lucide-react";

interface Props {
  fileLinks?: string | null;
}

function parseCustomFileLinks(fileLinks: string | null | undefined) {
  if (!fileLinks) return { description: "", photoPaths: [] };
  const descMatch = fileLinks.match(/Beschrijving:\s*(.*)/);
  const photosMatch = fileLinks.match(/Foto's:\s*(.*)/);
  return {
    description: descMatch?.[1]?.trim() || "",
    photoPaths: photosMatch?.[1]?.split(",").map((p) => p.trim()).filter(Boolean) || [],
  };
}

export function CustomPhotosSection({ fileLinks }: Props) {
  const { description, photoPaths } = parseCustomFileLinks(fileLinks);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUrls = async () => {
      const urls: Record<string, string> = {};
      for (const path of photoPaths) {
        const { data } = await supabase.storage.from("orders").createSignedUrl(path, 3600);
        if (data?.signedUrl) urls[path] = data.signedUrl;
      }
      setSignedUrls(urls);
      setLoading(false);
    };
    if (photoPaths.length > 0) fetchUrls();
    else setLoading(false);
  }, [fileLinks]);

  return (
    <div className="bg-card rounded-2xl p-6 shadow-overweel-card">
      <h3 className="font-bold text-primary mb-4 flex items-center gap-2">
        <ImageIcon className="w-5 h-5" /> Custom opdracht
      </h3>
      {description && (
        <div className="mb-4">
          <p className="text-xs text-muted-foreground mb-1">Beschrijving</p>
          <p className="text-sm whitespace-pre-wrap">{description}</p>
        </div>
      )}
      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : photoPaths.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {photoPaths.map((path) => (
            <a
              key={path}
              href={signedUrls[path]}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg overflow-hidden border border-border hover:border-accent transition-colors"
            >
              {signedUrls[path] ? (
                <img
                  src={signedUrls[path]}
                  alt="Custom opdracht foto"
                  className="w-full h-40 object-cover"
                />
              ) : (
                <div className="w-full h-40 bg-muted flex items-center justify-center">
                  <ImageIcon className="w-8 h-8 text-muted-foreground" />
                </div>
              )}
            </a>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Geen foto's beschikbaar.</p>
      )}
    </div>
  );
}
