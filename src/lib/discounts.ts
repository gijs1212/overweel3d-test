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
}

export function discountValidationError(
  discount: ApplicableDiscount | null,
  customerEmail: string,
  now = new Date(),
) {
  if (!discount || !discount.active) return "Ongeldige kortingscode.";
  if (discount.expires_at && new Date(discount.expires_at) < now) return "Deze kortingscode is verlopen.";
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
