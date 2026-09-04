import type { CheckoutResult } from "../checkout/types";
import type { OperationKind } from "../constants";
import type { PaymentMethodSetup } from "../payment-methods/types";

export type OperationEvent =
  | { type: "opening" | "opened" | "callback_received" | "confirming"; kind: OperationKind }
  | { type: "polling" | "completed" | "failed"; kind: OperationKind; status: string }
  | { type: "cancelled" | "timed_out"; kind: OperationKind };

export interface OperationOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  pollIntervalMs?: number;
  cspNonce?: string;
  navigate?: (url: string) => void;
  onEvent?: (event: OperationEvent) => void;
}

export interface OperationHandle<T, TKind extends OperationKind = OperationKind> {
  readonly kind: TKind;
  readonly completion: Promise<T>;
  cancel(): void;
}

type CheckoutResumeOperation = OperationHandle<
  CheckoutResult,
  typeof import("../constants").OperationKind.CHECKOUT
>;

type CardSavingResumeOperation = OperationHandle<
  PaymentMethodSetup,
  typeof import("../constants").OperationKind.CARD_SAVING
>;

export type ResumedOperation = CheckoutResumeOperation | CardSavingResumeOperation;
