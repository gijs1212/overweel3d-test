import { describe, expect, it } from "vitest";
import { createOrderConfirmationRequest } from "./orderConfirmation";

describe("guest order confirmation request", () => {
  it("includes the customer token required by the protected email function", () => {
    expect(createOrderConfirmationRequest({
      id: "80a7e236-1093-4b2b-b169-9dba86cd2590",
      customer_order_token: "a".repeat(64),
    })).toEqual({
      type: "order_confirmation",
      orderId: "80a7e236-1093-4b2b-b169-9dba86cd2590",
      customerOrderToken: "a".repeat(64),
    });
  });
});
