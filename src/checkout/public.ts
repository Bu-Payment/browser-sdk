import type { Checkout, CheckoutCreated, CheckoutLifecycle, CheckoutResult } from "./types";

const checkoutResponses = new WeakMap<Checkout, CheckoutCreated>();

export function publicCheckout(value: CheckoutCreated): Checkout {
  const checkout = Object.freeze({
    reference: value.reference,
    type: value.type,
    status: value.status,
    createdAt: value.createdAt,
    expiresAt: value.expiresAt,
  });
  checkoutResponses.set(checkout, value);
  return checkout;
}

export function internalCheckout(value: Checkout): CheckoutCreated | undefined {
  return checkoutResponses.get(value);
}

export function publicCheckoutResult(value: CheckoutLifecycle): CheckoutResult {
  return Object.freeze({
    reference: value.reference,
    type: value.type,
    status: value.status,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    expiresAt: value.expiresAt,
  });
}
