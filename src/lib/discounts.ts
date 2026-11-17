export interface ApplicableDiscount {
  code: string;
  discount_type: string;
  discount_value: number;
  active: boolean;
  expires_at: string | null;
  max_uses: number | null;
  times_used: number;
  assigned_to_email?: string | null;
  is_referral?: boolean;
  product_id?: string | null;
  category_id?: string | null;
  minimum_order_amount?: number;
  stackable?: boolean;
  per_customer_limit?: number | null;
  starts_at?: string | null;
}

export function discountValidationError(
  discount: ApplicableDiscount | null,
  customerEmail: string,
  now = new Date(),
  orderAmount?: number,
) {
  if (!discount || !discount.active) return "Ongeldige kortingscode.";
  if (discount.expires_at && new Date(discount.expires_at) < now) return "Deze kortingscode is verlopen.";
  if (discount.starts_at && new Date(discount.starts_at) > now) return "Deze kortingscode is nog niet actief.";
  if (orderAmount !== undefined && orderAmount < Number(discount.minimum_order_amount || 0)) return `Deze kortingscode geldt vanaf €${Number(discount.minimum_order_amount).toFixed(2)}.`;
  if (discount.max_uses !== null && discount.times_used >= discount.max_uses) return "Deze kortingscode is al maximaal gebruikt.";
  if (discount.assigned_to_email && discount.assigned_to_email.toLowerCase() !== customerEmail.trim().toLowerCase()) {
    return "Deze persoonlijke kortingscode hoort bij een ander e-mailadres.";
  }
  if (!Number.isFinite(Number(discount.discount_value)) || Number(discount.discount_value) <= 0) return "Deze kortingscode heeft geen geldige waarde.";
  if (discount.discount_type === "percentage" && Number(discount.discount_value) > 100) return "Deze kortingscode heeft geen geldig percentage.";
  if (!["percentage", "fixed"].includes(discount.discount_type)) return "Deze kortingscode heeft geen geldig type.";
  return null;
}

export function calculateDiscount(basePrice: number, discount: Pick<ApplicableDiscount, "discount_type" | "discount_value"> | null) {
  const safeBasePrice = Number.isFinite(basePrice) ? Math.max(0, basePrice) : 0;
  if (!discount) return { discountAmount: 0, total: safeBasePrice };
  const value = Math.max(0, Number(discount.discount_value) || 0);
  const discountAmount = discount.discount_type === "percentage"
    ? Math.min(safeBasePrice, safeBasePrice * (value / 100))
    : Math.min(safeBasePrice, value);
  return { discountAmount, total: Math.max(0, safeBasePrice - discountAmount) };
}

export function eligibleDiscountSubtotal(
  lines: ReadonlyArray<{ amount: number; productId?: string | null; categoryId?: string | null }>,
  productId: string | null,
  categoryId: string | null = null,
) {
  return lines.reduce((total, line) => {
    if (productId && line.productId !== productId) return total;
    if (categoryId && line.categoryId !== categoryId) return total;
    const amount = Number(line.amount);
    return total + (Number.isFinite(amount) ? Math.max(0, amount) : 0);
  }, 0);
}

export function discountScopeLabel(
  discount: Pick<ApplicableDiscount, "product_id" | "category_id" | "minimum_order_amount">,
  names: { productName?: string | null; categoryName?: string | null } = {},
) {
  const parts: string[] = [];
  if (discount.product_id) parts.push(`alleen voor ${names.productName || "het geselecteerde artikel"}`);
  else if (discount.category_id) parts.push(`voor categorie ${names.categoryName || "geselecteerde categorie"}`);
  else parts.push("voor de hele bestelling");
  if ((discount.minimum_order_amount || 0) > 0) parts.push(`vanaf €${Number(discount.minimum_order_amount).toFixed(2)}`);
  return parts.join(" · ");
}

