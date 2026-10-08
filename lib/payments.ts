/** Rupees (what people type) → paise (what Meta wants), without float drift. */
export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export const PAYMENT_GATEWAYS = ["razorpay", "payu"] as const;
export type PaymentGateway = (typeof PAYMENT_GATEWAYS)[number];

/** Statuses a seller may announce with an order_status message. */
export const ORDER_STATUSES = ["processing", "shipped", "completed", "canceled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
