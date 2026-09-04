import { ErrorCode, OperationKind } from "../constants";
import { BuPaymentError } from "../errors";
import type {
  PresentationEvent,
  PresentationFlow,
  PresentationHandle,
  PresentationOptions,
} from "./types";

export type EmitPresentationEvent = (
  event:
    | { type: "opening" | "opened" | "callback_received" | "confirming" }
    | { type: "polling" | "completed" | "failed"; status: string }
    | { type: "cancelled" | "timed_out" },
) => void;

export function createPresentationHandle<T>(
  flow: PresentationFlow,
  options: PresentationOptions,
  operation: (signal: AbortSignal, emit: EmitPresentationEvent) => Promise<T>,
): PresentationHandle<T> {
  const kind = flow.startsWith("checkout") ? OperationKind.CHECKOUT : OperationKind.CARD_SAVING;
  const controller = new AbortController();
  let terminal = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const emit: EmitPresentationEvent = (event) =>
    options.onEvent?.({ ...event, kind } as PresentationEvent);
  const abort = (reason: unknown, type: "cancelled" | "timed_out") => {
    if (terminal || controller.signal.aborted) return;
    emit({ type });
    controller.abort(reason);
  };
  const externalAbort = () => abort(abortError(options.signal?.reason), "cancelled");
  if (
    options.timeoutMs !== undefined &&
    (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1)
  ) {
    throw new BuPaymentError("timeoutMs must be a positive number", {
      code: ErrorCode.VALIDATION_FAILED,
    });
  }
  emit({ type: "opening" });
  options.signal?.addEventListener("abort", externalAbort, { once: true });
  if (options.signal?.aborted) externalAbort();
  if (options.timeoutMs !== undefined) {
    timeout = setTimeout(() => abort(timeoutError(), "timed_out"), options.timeoutMs);
  }
  let result: Promise<T>;
  try {
    result = controller.signal.aborted
      ? Promise.reject<T>(controller.signal.reason)
      : operation(controller.signal, emit);
  } catch (cause) {
    result = Promise.reject(
      cause instanceof BuPaymentError
        ? cause
        : new BuPaymentError("Operation failed", { code: ErrorCode.OPERATION_FAILED, cause }),
    );
  }
  const completion = result
    .catch((cause: unknown) => {
      if (cause instanceof BuPaymentError) throw cause;
      throw new BuPaymentError("Operation failed", { code: ErrorCode.OPERATION_FAILED, cause });
    })
    .finally(() => {
      terminal = true;
      if (timeout) clearTimeout(timeout);
      options.signal?.removeEventListener("abort", externalAbort);
    });
  return { kind, completion, cancel: () => abort(abortError(), "cancelled") };
}

function abortError(cause?: unknown): BuPaymentError {
  return new BuPaymentError("Operation cancelled", {
    code: ErrorCode.OPERATION_CANCELLED,
    ...(cause === undefined ? {} : { cause }),
  });
}

function timeoutError(): BuPaymentError {
  return new BuPaymentError("Operation timed out", { code: ErrorCode.OPERATION_TIMED_OUT });
}
