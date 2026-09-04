import { ErrorCode, type ErrorCode as ErrorCodeValue } from "./constants";
import { asObject, asString } from "./core/validation";

export interface BuPaymentErrorOptions {
  code: ErrorCodeValue;
  status?: number;
  requestId?: string;
  cause?: unknown;
  metadata?: Readonly<Record<string, string | number | boolean>>;
}

export class BuPaymentError extends Error {
  readonly code: ErrorCodeValue;
  readonly status: number | undefined;
  readonly requestId: string | undefined;
  readonly metadata: Readonly<Record<string, string | number | boolean>> | undefined;

  constructor(message: string, options: BuPaymentErrorOptions) {
    super(message, { cause: options.cause });
    this.name = "BuPaymentError";
    this.code = options.code;
    this.status = options.status;
    this.requestId = options.requestId;
    this.metadata = options.metadata;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      ...(this.status === undefined ? {} : { status: this.status }),
      ...(this.requestId === undefined ? {} : { requestId: this.requestId }),
      ...(this.metadata === undefined ? {} : { metadata: this.metadata }),
    };
  }
}

const apiErrorCodes = new Set<ErrorCodeValue>(Object.values(ErrorCode));

export async function errorFromResponse(
  response: Response,
  signal?: AbortSignal,
): Promise<BuPaymentError> {
  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    if (signal?.aborted === true || isAbortError(cause)) return requestError(cause, signal);
    return invalidResponse(response.status, cause);
  }
  try {
    const object = asObject(body, "Error");
    const apiCode = asString(object.error, "error");
    const message = Array.isArray(object.message)
      ? object.message.map((item) => asString(item, "message")).join("; ")
      : asString(object.message, "message");
    const code = apiErrorCodes.has(apiCode as ErrorCodeValue)
      ? (apiCode as ErrorCodeValue)
      : ErrorCode.OPERATION_FAILED;
    return new BuPaymentError(message, {
      code,
      status: response.status,
      ...(typeof object.requestId === "string" ? { requestId: object.requestId } : {}),
      ...(code === ErrorCode.OPERATION_FAILED ? { metadata: { apiCode } } : {}),
    });
  } catch (cause) {
    return invalidResponse(response.status, cause);
  }
}

export async function jsonFromResponse(
  response: Response,
  message: string,
  signal?: AbortSignal,
): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    if (signal?.aborted === true || isAbortError(error)) throw requestError(error, signal);
    throw toBuPaymentError(error, ErrorCode.RESPONSE_INVALID, message);
  }
}

function invalidResponse(status: number, cause: unknown): BuPaymentError {
  return new BuPaymentError(`BuPayment request failed with HTTP ${status}`, {
    code: ErrorCode.RESPONSE_INVALID,
    status,
    cause,
  });
}

export function toBuPaymentError(
  error: unknown,
  code: ErrorCodeValue,
  message: string,
): BuPaymentError {
  if (error instanceof BuPaymentError) return error;
  return new BuPaymentError(message, { code, cause: error });
}

export function requestError(error: unknown, signal?: AbortSignal): BuPaymentError {
  if (error instanceof BuPaymentError) return error;
  if (signal?.aborted === true) {
    if (signal.reason instanceof BuPaymentError) return signal.reason;
    return new BuPaymentError("BuPayment request was cancelled", {
      code: ErrorCode.OPERATION_CANCELLED,
      cause: signal.reason ?? error,
    });
  }
  if (isAbortError(error)) {
    return new BuPaymentError("BuPayment request was cancelled", {
      code: ErrorCode.OPERATION_CANCELLED,
      cause: error,
    });
  }
  return new BuPaymentError("BuPayment request could not reach the network", {
    code: ErrorCode.NETWORK_UNAVAILABLE,
    cause: error,
  });
}

export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "name" in error && error.name === "AbortError"
  );
}
