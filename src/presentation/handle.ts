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
  const controller = new AbortController();
  let terminal = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const emit: EmitPresentationEvent = (event) =>
    options.onEvent?.({ ...event, flow } as PresentationEvent);
  const abort = (reason: unknown, type: "cancelled" | "timed_out") => {
    if (terminal || controller.signal.aborted) return;
    emit({ type });
    controller.abort(reason);
  };
  const externalAbort = () => abort(options.signal?.reason ?? abortError(), "cancelled");
  if (
    options.timeoutMs !== undefined &&
    (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1)
  ) {
    throw new RangeError("timeoutMs must be a positive number");
  }
  emit({ type: "opening" });
  options.signal?.addEventListener("abort", externalAbort, { once: true });
  if (options.signal?.aborted) externalAbort();
  if (options.timeoutMs !== undefined) {
    timeout = setTimeout(() => abort(timeoutError(), "timed_out"), options.timeoutMs);
  }
  const result = controller.signal.aborted
    ? Promise.reject<T>(controller.signal.reason)
    : operation(controller.signal, emit);
  const completion = result.finally(() => {
    terminal = true;
    if (timeout) clearTimeout(timeout);
    options.signal?.removeEventListener("abort", externalAbort);
  });
  return { completion, cancel: () => abort(abortError(), "cancelled") };
}

function abortError(): DOMException {
  return new DOMException("Presentation cancelled", "AbortError");
}

function timeoutError(): DOMException {
  return new DOMException("Presentation timed out", "TimeoutError");
}
