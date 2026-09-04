import { asObject, assertExactKeys } from "../core/validation";

export function parseModalPayload(value: unknown): Record<string, unknown> {
  const object = asObject(value, "Modal callback");
  let serialized: string;
  try {
    serialized = JSON.stringify(object);
  } catch {
    throw new TypeError("Modal callback must be JSON serializable");
  }
  if (serialized.length > 16_384) throw new TypeError("Modal callback is too large");
  return object;
}

export function parseCallbackAccepted(value: unknown): void {
  const object = asObject(value, "Modal callback response");
  assertExactKeys(object, ["accepted"], "Modal callback response");
  if (object.accepted !== true) throw new TypeError("Modal callback was not accepted");
}
