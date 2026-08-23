export interface ReportOrder {
  status: string;
  final_price: number | null;
  instant_quote_price: number | null;
  material_cost?: number | null;
  filament_used_g?: number | null;
  catalog_items?: unknown;
}

export function buildAdminReport(orders: ReportOrder[]) {
  const paid = orders.filter((order) => ["in_production", "completed"].includes(order.status));
  const revenue = paid.reduce((sum, order) => sum + Number(order.final_price ?? order.instant_quote_price ?? 0), 0);
  const materialCost = paid.reduce((sum, order) => sum + Number(order.material_cost || 0), 0);
  const filamentGrams = paid.reduce((sum, order) => sum + Number(order.filament_used_g || 0), 0);
  const products = new Map<string, { name: string; quantity: number; revenue: number }>();
  for (const order of paid) {
    if (!Array.isArray(order.catalog_items)) continue;
    for (const raw of order.catalog_items) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as Record<string, unknown>;
      const name = String(item.productName || item.name || "Product");
      const quantity = Math.max(1, Number(item.quantity || 1));
      const itemRevenue = Number(item.unitPrice || item.price || 0) * quantity;
      const current = products.get(name) || { name, quantity: 0, revenue: 0 };
      current.quantity += quantity;
      current.revenue += itemRevenue;
      products.set(name, current);
    }
  }
  return {
    orderCount: paid.length,
    revenue,
    materialCost,
    estimatedProfit: revenue - materialCost,
    filamentGrams,
    averageOrder: paid.length ? revenue / paid.length : 0,
    topProducts: [...products.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 10),
  };
}
