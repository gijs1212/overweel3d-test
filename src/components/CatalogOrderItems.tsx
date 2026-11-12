import { useEffect, useState } from "react";
import { ImageIcon, Package } from "lucide-react";

import { CatalogOrderItem } from "@/lib/productCatalog";
import { getProductPhotoUrl } from "@/lib/productPhotos";

function AnswerImage({ path, label }: { path: string; label: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let current = true;
    getProductPhotoUrl(path).then((nextUrl) => current && setUrl(nextUrl));
    return () => { current = false; };
  }, [path]);
  if (!url) return <div className="w-20 h-20 rounded-lg bg-muted animate-pulse" />;
  return <a href={url} target="_blank" rel="noopener noreferrer" className="block"><img src={url} alt={label} className="w-20 h-20 rounded-lg object-cover border" /></a>;
}

export function CatalogOrderItems({ items }: { items?: unknown }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const catalogItems = items as CatalogOrderItem[];
  return <section className="bg-card rounded-2xl p-6 shadow-overweel-card">
    <h3 className="font-bold text-primary mb-4 flex items-center gap-2"><Package className="w-5 h-5" /> Kant-en-klare producten en personalisatie</h3>
    <div className="space-y-4">
      {catalogItems.map((item, index) => <article key={`${item.productId}-${index}`} className="rounded-xl border p-4">
        <div className="flex flex-wrap justify-between gap-2">
          <div><h4 className="font-semibold text-primary">{item.productName}</h4><p className="text-sm text-muted-foreground">{item.quantity}× · {item.material} · {item.colors?.length ? item.colors.map((color) => color.slotLabel ? `${color.slotLabel}: ${color.name}` : color.name).join(" · ") : "Geen kleurkeuze"}</p></div>
          <p className="font-semibold text-accent">€{Number(item.totalPrice || 0).toFixed(2)}</p>
        </div>
        {item.answers?.length > 0 && <dl className="mt-4 grid sm:grid-cols-2 gap-3">
          {item.answers.map((answer, answerIndex) => <div key={`${answer.optionId}-${answerIndex}`} className="rounded-lg bg-muted/40 p-3">
            <dt className="text-xs font-semibold text-muted-foreground">{answer.label}</dt>
            <dd className="text-sm whitespace-pre-wrap mt-1">{answer.addonQuantity ? `${answer.addonQuantity * item.quantity}× totaal (${answer.addonQuantity} per product)` : typeof answer.value === "boolean" ? (answer.value ? "Ja" : "Nee") : answer.value}</dd>
            {answer.files?.length ? <div className="flex flex-wrap gap-2 mt-2"><span className="sr-only"><ImageIcon />Bijlagen</span>{answer.files.map((path) => <AnswerImage key={path} path={path} label={answer.label} />)}</div> : null}
          </div>)}
        </dl>}
      </article>)}
    </div>
  </section>;
}
