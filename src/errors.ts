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

export async function errorFromResponse(response: Response): Promise<BuPaymentError> {
  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
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
