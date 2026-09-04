export type PaymentMethodStatus =
  | "active"
  | "replacement_required"
  | "revoked"
  | "permanently_invalid";

export type PaymentMethodSetupStatus =
  | "processing"
  | "requires_action"
  | "succeeded"
  | "failed"
  | "expired";

export interface StoredPaymentMethod {
  id: string;
  status: PaymentMethodStatus;
  brand?: string;
  lastDigits?: string;
  expiry?: { month: number; year: number };
  createdAt: string;
  updatedAt: string;
}

export interface PaymentMethodSetup {
  id: string;
  status: PaymentMethodSetupStatus;
  expiresAt: string;
  paymentMethod?: StoredPaymentMethod;
}

export interface PaymentMethodSetupResponse extends PaymentMethodSetup {
  presentationVersion?: 1;
  presentation?: { kind: "redirect"; url: string };
  actions: {
    status: { method: "GET"; url: string };
    confirm?: { method: "POST"; url: string };
  };
}
