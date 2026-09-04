import { expect, test, vi } from "vitest";
import { ErrorCode, OperationKind } from "../../src/constants";
import { createPresentationHandle } from "../../src/presentation/handle";

test("emits opening before cancellation for a pre-aborted signal", async () => {
  const controller = new AbortController();
  controller.abort(new DOMException("cancelled", "AbortError"));
  const events: string[] = [];

  const operation = vi.fn(async (signal: AbortSignal) => {
    if (signal.aborted) throw signal.reason;
    return "unexpected";
  });
  const handle = createPresentationHandle(
    "checkout_resume",
    { signal: controller.signal, onEvent: (event) => events.push(event.type) },
    operation,
  );

  await expect(handle.completion).rejects.toMatchObject({ code: ErrorCode.OPERATION_CANCELLED });
  expect(handle.kind).toBe(OperationKind.CHECKOUT);
  expect(events).toEqual(["opening", "cancelled"]);
  expect(operation).not.toHaveBeenCalled();
});

test("reports timeout through a stable operation code", async () => {
  const handle = createPresentationHandle(
    "payment_method_resume",
    { timeoutMs: 1 },
    (signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
  );

  await expect(handle.completion).rejects.toMatchObject({ code: ErrorCode.OPERATION_TIMED_OUT });
  expect(handle.kind).toBe(OperationKind.CARD_SAVING);
});
