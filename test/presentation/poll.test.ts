import { expect, test, vi } from "vitest";
import { pollCanonical } from "../../src/presentation/poll";

test("removes each abort listener after a polling delay resolves", async () => {
  const controller = new AbortController();
  const add = vi.spyOn(controller.signal, "addEventListener");
  const remove = vi.spyOn(controller.signal, "removeEventListener");
  let reads = 0;

  await pollCanonical(
    async () => ({ status: ++reads === 1 ? "pending" : "completed" }),
    controller.signal,
    vi.fn(),
    new Set(["completed"]),
    new Set(["completed"]),
    1,
  );

  expect(add).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledTimes(1);
});
