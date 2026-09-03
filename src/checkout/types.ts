export type CheckoutType = "payment" | "subscription";
export type CheckoutStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "expired"
  | "cancelled";

export interface CreateCheckoutInput {
  priceId: string;
  email: string;
  quantity: number;
  destinationKey: string;
}

export interface RedirectPresentation {
  kind: "redirect";
  url: string;
}

export interface ModalPresentation {
  kind: "modal";
  script: { url: "https://payment.tmtprotects.com/tmt-payment-modal.3.6.1.js" };
  configuration: {
    sessionToken: string;
    amount: number;
    currency: string;
    reference: string;
  };
  callback: { url: string; token: string };
}

export interface CheckoutCreated {
  reference: string;
  type: CheckoutType;
  status: "pending";
  presentationVersion: 1;
  presentation: RedirectPresentation | ModalPresentation;
  checkoutUrl?: string;
  createdAt: string;
  expiresAt: string;
}

export interface CheckoutLifecycle {
  reference: string;
  type: CheckoutType;
  status: CheckoutStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}
