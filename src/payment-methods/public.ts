import type { PaymentMethodSetup, PaymentMethodSetupResponse } from "./types";

export function publicPaymentMethodSetup(setup: PaymentMethodSetupResponse): PaymentMethodSetup {
  return Object.freeze({
    id: setup.id,
    status: setup.status,
    expiresAt: setup.expiresAt,
    ...(setup.paymentMethod ? { paymentMethod: setup.paymentMethod } : {}),
  });
}
