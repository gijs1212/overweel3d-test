export interface CreatedOrderReference {
  id: string;
  customer_order_token: string;
}

export function createOrderConfirmationRequest(order: CreatedOrderReference) {
  return {
    type: "order_confirmation" as const,
    orderId: order.id,
    customerOrderToken: order.customer_order_token,
  };
}
