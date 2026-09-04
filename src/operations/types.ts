import type { OperationKind } from "../constants";

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

export interface OperationHandle<T> {
  readonly kind: OperationKind;
  readonly completion: Promise<T>;
  cancel(): void;
}
