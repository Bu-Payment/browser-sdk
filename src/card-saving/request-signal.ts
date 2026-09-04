import { ErrorCode } from "../constants";
import { BuPaymentError } from "../errors";

export function cardSavingRequestSignal(signal?: AbortSignal, timeoutMs?: number) {
  if (timeoutMs === undefined) return { signal, cleanup: () => undefined };
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) {
    throw new BuPaymentError("timeoutMs must be a positive number", {
      code: ErrorCode.VALIDATION_FAILED,
    });
  }
  const controller = new AbortController();
  const externalAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", externalAbort, { once: true });
  if (signal?.aborted) externalAbort();
  const timeout = setTimeout(
    () =>
      controller.abort(
        new BuPaymentError("Card-saving start timed out", {
          code: ErrorCode.OPERATION_TIMED_OUT,
        }),
      ),
    timeoutMs,
  );
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", externalAbort);
    },
  };
}
