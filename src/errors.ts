import { asObject, asString } from "./core/validation";

export interface BuPaymentErrorOptions {
  code: string;
  status: number;
  requestId?: string | undefined;
  cause?: unknown;
}

export class BuPaymentError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId: string | undefined;

  constructor(message: string, options: BuPaymentErrorOptions) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.code = options.code;
    this.status = options.status;
    this.requestId = options.requestId;
  }

  toJSON() {
    return { name: this.name, code: this.code, status: this.status, requestId: this.requestId };
  }
}

export class SessionMalformedError extends BuPaymentError {}
export class SessionInvalidError extends BuPaymentError {}
export class SessionExpiredError extends BuPaymentError {}
export class SessionRotatedError extends BuPaymentError {}
export class CapabilityDeniedError extends BuPaymentError {}
export class RateLimitedError extends BuPaymentError {}
export class ValidationError extends BuPaymentError {}
export class NotFoundError extends BuPaymentError {}
export class IdempotencyConflictError extends BuPaymentError {}
export class CheckoutDestinationUnavailableError extends BuPaymentError {}
export class CheckoutLiveNotEnabledError extends BuPaymentError {}
export class CheckoutProviderFailedError extends BuPaymentError {}
export class CheckoutUnavailableError extends BuPaymentError {}
export class SessionUnavailableError extends BuPaymentError {}
export class CatalogueUnavailableError extends BuPaymentError {}
export class CustomerSessionMalformedError extends BuPaymentError {}
export class CustomerVerificationInvalidError extends BuPaymentError {}
export class CustomerSessionInvalidError extends BuPaymentError {}
export class CustomerSessionExpiredError extends BuPaymentError {}
export class CustomerRateLimitedError extends BuPaymentError {}
export class CustomerSessionUnavailableError extends BuPaymentError {}

const errorTypes: Record<string, typeof BuPaymentError> = {
  application_session_malformed: SessionMalformedError,
  application_session_invalid: SessionInvalidError,
  application_session_expired: SessionExpiredError,
  application_session_rotated: SessionRotatedError,
  application_capability_denied: CapabilityDeniedError,
  application_rate_limited: RateLimitedError,
  application_session_unavailable: SessionUnavailableError,
  invalid_request: ValidationError,
  not_found: NotFoundError,
  idempotency_conflict: IdempotencyConflictError,
  checkout_destination_unavailable: CheckoutDestinationUnavailableError,
  checkout_live_not_enabled: CheckoutLiveNotEnabledError,
  checkout_provider_failed: CheckoutProviderFailedError,
  checkout_unavailable: CheckoutUnavailableError,
  catalogue_unavailable: CatalogueUnavailableError,
  customer_session_malformed: CustomerSessionMalformedError,
  customer_verification_invalid: CustomerVerificationInvalidError,
  customer_session_invalid: CustomerSessionInvalidError,
  customer_session_expired: CustomerSessionExpiredError,
  customer_rate_limited: CustomerRateLimitedError,
  customer_session_unavailable: CustomerSessionUnavailableError,
};

export async function errorFromResponse(response: Response): Promise<BuPaymentError> {
  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    return new BuPaymentError(`BuPayment request failed with HTTP ${response.status}`, {
      code: "invalid_error_response",
      status: response.status,
      cause,
    });
  }
  try {
    const object = asObject(body, "Error");
    const code = asString(object.error, "error");
    const message = Array.isArray(object.message)
      ? object.message.map((item) => asString(item, "message")).join("; ")
      : asString(object.message, "message");
    const ErrorType = errorTypes[code] ?? BuPaymentError;
    return new ErrorType(message, {
      code,
      status: response.status,
      requestId: typeof object.requestId === "string" ? object.requestId : undefined,
    });
  } catch (cause) {
    return new BuPaymentError(`BuPayment request failed with HTTP ${response.status}`, {
      code: "invalid_error_response",
      status: response.status,
      cause,
    });
  }
}
