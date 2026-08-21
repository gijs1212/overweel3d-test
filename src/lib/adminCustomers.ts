export interface CustomerProfileRow {
  user_id: string;
  full_name: string;
  email: string;
  billing_address: string | null;
  shipping_address: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
}

export interface CustomerOrderRow {
  user_id: string | null;
  customer_email: string;
  final_price: number | null;
  shipping_cost: number | null;
  status: string;
}

export interface AdminCustomer {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  address: string;
  orderCount: number;
  totalSpent: number;
}

const excludedStatuses = new Set(["draft", "rejected_by_customer", "cancelled"]);

export function splitCustomerName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts.shift() || "—",
    lastName: parts.join(" ") || "—",
  };
}

export function buildAdminCustomers(
  profiles: readonly CustomerProfileRow[],
  orders: readonly CustomerOrderRow[],
): AdminCustomer[] {
  return profiles.map((profile) => {
    const email = profile.email.trim().toLowerCase();
    const customerOrders = orders.filter((order) =>
      !excludedStatuses.has(order.status)
      && order.final_price !== null
      && (order.user_id === profile.user_id || (!order.user_id && order.customer_email.trim().toLowerCase() === email)),
    );
    const street = profile.billing_address?.trim() || profile.shipping_address?.trim() || "";
    const locality = [profile.postal_code?.trim(), profile.city?.trim()].filter(Boolean).join(" ");
    const address = [street, locality, profile.country?.trim()].filter(Boolean).join(", ") || "—";
    const { firstName, lastName } = splitCustomerName(profile.full_name || "");

    return {
      userId: profile.user_id,
      firstName,
      lastName,
      email: profile.email || "—",
      address,
      orderCount: customerOrders.length,
      totalSpent: customerOrders.reduce(
        (total, order) => total + Number(order.final_price || 0) + Number(order.shipping_cost || 0),
        0,
      ),
    };
  }).sort((a, b) => b.totalSpent - a.totalSpent || a.lastName.localeCompare(b.lastName, "nl"));
}
