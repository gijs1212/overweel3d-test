import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MATERIALS } from "@/lib/constants";

export interface MaterialChoice { id: string; name: string; price_per_gram?: number; active?: boolean; sort_order?: number }

export function useMaterials(includeInactive = false) {
  const [materials, setMaterials] = useState<MaterialChoice[]>(MATERIALS);
  useEffect(() => {
    let active = true;
    let query = supabase.from("materials").select("id,name,price_per_gram,active,sort_order").order("sort_order").order("name");
    if (!includeInactive) query = query.eq("active", true);
    query.then(({ data }) => { if (active && data?.length) setMaterials(data); });
    return () => { active = false; };
  }, [includeInactive]);
  return materials;
}
