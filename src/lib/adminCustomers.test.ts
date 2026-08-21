import { describe, expect, it } from "vitest";
import { buildAdminCustomers, splitCustomerName } from "./adminCustomers";

describe("admin customer helpers", () => {
  it("splits the first name from the complete surname", () => {
    expect(splitCustomerName("Jan van der Meer")).toEqual({ firstName: "Jan", lastName: "van der Meer" });
  });

  it("totals final prices and shipping while excluding cancelled orders", () => {
    const customers = buildAdminCustomers([
      { user_id: "u1", full_name: "Saar de Wit", email: "saar@example.nl", billing_address: "Dorpsstraat 1", shipping_address: "", postal_code: "1234 AB", city: "Hoorn", country: "Nederland" },
    ], [
      { user_id: "u1", customer_email: "saar@example.nl", final_price: 20, shipping_cost: 5, status: "completed" },
      { user_id: "u1", customer_email: "saar@example.nl", final_price: 50, shipping_cost: 0, status: "cancelled" },
      { user_id: null, customer_email: "SAAR@example.nl", final_price: 10, shipping_cost: 0, status: "in_production" },
    ]);

    expect(customers[0]).toMatchObject({ firstName: "Saar", lastName: "de Wit", orderCount: 2, totalSpent: 35 });
    expect(customers[0].address).toBe("Dorpsstraat 1, 1234 AB Hoorn, Nederland");
  });
});
