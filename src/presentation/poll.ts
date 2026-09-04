import type { EmitPresentationEvent } from "./handle";

export interface CanonicalStatus {
  status: string;
}

export async function pollCanonical<T extends CanonicalStatus>(
  read: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
  emit: EmitPresentationEvent,
  terminal: ReadonlySet<string>,
  successful: ReadonlySet<string>,
  intervalMs = 1_000,
): Promise<T> {
  if (!Number.isFinite(intervalMs) || intervalMs < 0) {
    throw new RangeError("pollIntervalMs must be a non-negative number");
  }
  while (true) {
    throwIfAborted(signal);
    const value = await read(signal);
    if (terminal.has(value.status)) {
      emit({ type: successful.has(value.status) ? "completed" : "failed", status: value.status });
      return value;
    }
    emit({ type: "polling", status: value.status });
    await wait(intervalMs, signal);
  }
}

function wait(delayMs: number, signal: AbortSignal): Promise<void> {
  if (delayMs === 0) return Promise.resolve().then(() => throwIfAborted(signal));
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, delayMs);
    const abort = () => {
      clearTimeout(timeout);
      reject(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason;
}
