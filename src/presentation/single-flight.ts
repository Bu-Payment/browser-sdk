import type { PresentationHandle } from "./types";

export function presentationSingleFlight<T>(
  flights: Map<string, PresentationHandle<T>>,
  key: string,
  create: () => PresentationHandle<T>,
): PresentationHandle<T> {
  const current = flights.get(key);
  if (current) return current;
  const handle = create();
  flights.set(key, handle);
  const clear = () => {
    if (flights.get(key) === handle) flights.delete(key);
  };
  handle.completion.then(clear, clear);
  return handle;
}
