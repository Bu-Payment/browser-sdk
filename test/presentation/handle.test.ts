import { expect, test, vi } from "vitest";
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

  await expect(handle.completion).rejects.toMatchObject({ name: "AbortError" });
  expect(events).toEqual(["opening", "cancelled"]);
  expect(operation).not.toHaveBeenCalled();
});
