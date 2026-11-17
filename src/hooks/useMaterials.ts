import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MATERIALS } from "@/lib/constants";
import { normalizeMaterialId } from "@/lib/productCatalog";

export interface MaterialChoice { id: string; name: string; price_per_gram?: number; active?: boolean; sort_order?: number; record_id?: string }

export function useMaterials(includeInactive = false) {
  const [materials, setMaterials] = useState<MaterialChoice[]>(MATERIALS);
  useEffect(() => {
    let active = true;
    let query = supabase.from("materials").select("id,name,price_per_gram,active,sort_order").order("sort_order").order("name");
    if (!includeInactive) query = query.eq("active", true);
    query.then(({ data }) => {
      if (active && data?.length) setMaterials(data.map((material) => ({
        ...material,
        record_id: material.id,
        // Migrated PocketBase rows have random record ids, while colors and
        // product rules consistently use material slugs/names (PLA, PETG…).
        id: normalizeMaterialId(material.name || material.id),
      })));
    });
    return () => { active = false; };
  }, [includeInactive]);
  return materials;
}
