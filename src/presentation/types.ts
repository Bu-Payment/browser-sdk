export type PresentationFlow =
  | "checkout_redirect"
  | "checkout_modal"
  | "checkout_resume"
  | "payment_method_setup"
  | "payment_method_resume";

export type PresentationEvent =
  | { type: "opening" | "opened" | "callback_received" | "confirming"; flow: PresentationFlow }
  | { type: "polling" | "completed" | "failed"; flow: PresentationFlow; status: string }
  | { type: "cancelled" | "timed_out"; flow: PresentationFlow };

export interface PresentationOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  pollIntervalMs?: number;
  cspNonce?: string;
  navigate?: (url: string) => void;
  onEvent?: (event: PresentationEvent) => void;
}

export interface PresentationHandle<T> {
  readonly completion: Promise<T>;
  cancel(): void;
}
