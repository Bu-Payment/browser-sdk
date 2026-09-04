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

export type ModalVerificationField =
  | "allocations"
  | "charge_channel"
  | "country"
  | "date"
  | "email"
  | "firstname"
  | "reference"
  | "surname";

export interface ModalPresentation {
  kind: "modal";
  adapter: "trust-my-travel-payment-modal";
  resource: {
    url: "https://payment.tmtprotects.com/tmt-payment-modal.3.6.1.js";
    version: "3.6.1";
  };
  configuration: {
    path: string;
    environment: "test" | "live";
    booking: {
      id: number;
      channelId: number;
      currency: string;
      amount: number;
      allocations: [];
      reference: string;
    };
    payer: {
      name: string;
      email: string;
      address: string;
      city: string;
      postalCode: string;
      country: string;
    };
    description?: string;
    passengerCount?: number;
    transactionType?: "authorize";
  };
  authorization: {
    value: string;
    verificationFields: ModalVerificationField[];
    expiresAt: string;
  };
}

export interface CheckoutActions {
  status: { method: "GET"; url: string };
  callback?: { method: "POST"; url: string; token: string };
}

export interface CheckoutCreated {
  reference: string;
  type: CheckoutType;
  status: CheckoutStatus;
  presentationVersion?: 1;
  presentation?: RedirectPresentation | ModalPresentation;
  actions: CheckoutActions;
  checkoutUrl?: string;
  createdAt: string;
  expiresAt: string;
}

export interface CheckoutLifecycle {
  reference: string;
  type: CheckoutType;
  status: CheckoutStatus;
  presentationVersion?: 1;
  presentation?: RedirectPresentation | ModalPresentation;
  actions: CheckoutActions;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface Checkout {
  reference: string;
  type: CheckoutType;
  status: CheckoutStatus;
  createdAt: string;
  expiresAt: string;
}

export interface CheckoutResult extends Checkout {
  updatedAt: string;
}
