import { expect, test } from "vitest";
import { createPresentationHandle } from "../../src/presentation/handle";

test("emits opening before cancellation for a pre-aborted signal", async () => {
  const controller = new AbortController();
  controller.abort(new DOMException("cancelled", "AbortError"));
  const events: string[] = [];

  const handle = createPresentationHandle(
    "checkout_resume",
    { signal: controller.signal, onEvent: (event) => events.push(event.type) },
    async (signal) => {
      if (signal.aborted) throw signal.reason;
      return "unexpected";
    },
  );

  await expect(handle.completion).rejects.toMatchObject({ name: "AbortError" });
  expect(events).toEqual(["opening", "cancelled"]);
});
