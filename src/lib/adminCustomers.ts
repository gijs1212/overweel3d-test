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
  customer_name?: string;
  billing_address?: string | null;
  shipping_address?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
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
  source: "account" | "admin_order";
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
  const profileCustomers = profiles.map((profile) => {
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
      source: "account" as const,
    };
  });
  const profileEmails = new Set(profiles.map((profile) => profile.email.trim().toLowerCase()));
  const grouped = new Map<string, CustomerOrderRow[]>();
  orders.forEach((order) => {
    const email = order.customer_email.trim().toLowerCase();
    if (email && !profileEmails.has(email)) grouped.set(email, [...(grouped.get(email) || []), order]);
  });
  const adminOrderCustomers = [...grouped.entries()].map(([email, customerOrders]) => {
    const latest = customerOrders[customerOrders.length - 1];
    const { firstName, lastName } = splitCustomerName(latest.customer_name || "");
    const street = latest.billing_address?.trim() || latest.shipping_address?.trim() || "";
    const locality = [latest.postal_code?.trim(), latest.city?.trim()].filter(Boolean).join(" ");
    const validOrders = customerOrders.filter((order) => !excludedStatuses.has(order.status) && order.final_price !== null);
    return {
      userId: `order:${email}`, firstName, lastName, email: latest.customer_email,
      address: [street, locality, latest.country?.trim()].filter(Boolean).join(", ") || "—",
      orderCount: validOrders.length,
      totalSpent: validOrders.reduce((total, order) => total + Number(order.final_price || 0) + Number(order.shipping_cost || 0), 0),
      source: "admin_order" as const,
    };
  });
  return [...profileCustomers, ...adminOrderCustomers].sort((a, b) => b.totalSpent - a.totalSpent || a.lastName.localeCompare(b.lastName, "nl"));
}
