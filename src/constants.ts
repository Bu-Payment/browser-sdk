export const ErrorCode = Object.freeze({
  APPLICATION_SESSION_MALFORMED: "application_session_malformed",
  APPLICATION_SESSION_INVALID: "application_session_invalid",
  APPLICATION_SESSION_EXPIRED: "application_session_expired",
  APPLICATION_SESSION_ROTATED: "application_session_rotated",
  APPLICATION_CAPABILITY_DENIED: "application_capability_denied",
  APPLICATION_RATE_LIMITED: "application_rate_limited",
  APPLICATION_SESSION_UNAVAILABLE: "application_session_unavailable",
  INVALID_REQUEST: "invalid_request",
  NOT_FOUND: "not_found",
  IDEMPOTENCY_CONFLICT: "idempotency_conflict",
  CHECKOUT_DESTINATION_UNAVAILABLE: "checkout_destination_unavailable",
  CHECKOUT_LIVE_NOT_ENABLED: "checkout_live_not_enabled",
  CHECKOUT_PROVIDER_FAILED: "checkout_provider_failed",
  CHECKOUT_UNAVAILABLE: "checkout_unavailable",
  CATALOGUE_UNAVAILABLE: "catalogue_unavailable",
  CUSTOMER_SESSION_MALFORMED: "customer_session_malformed",
  CUSTOMER_VERIFICATION_INVALID: "customer_verification_invalid",
  CUSTOMER_SESSION_INVALID: "customer_session_invalid",
  CUSTOMER_SESSION_EXPIRED: "customer_session_expired",
  CUSTOMER_RATE_LIMITED: "customer_rate_limited",
  CUSTOMER_SESSION_UNAVAILABLE: "customer_session_unavailable",
  CONFIGURATION_INVALID: "configuration_invalid",
  VALIDATION_FAILED: "validation_failed",
  RESPONSE_INVALID: "response_invalid",
  NETWORK_UNAVAILABLE: "network_unavailable",
  STORAGE_UNAVAILABLE: "storage_unavailable",
  RESUME_INVALID: "resume_invalid",
  RESUME_FAILED: "resume_failed",
  OPERATION_FAILED: "operation_failed",
  OPERATION_CANCELLED: "operation_cancelled",
  OPERATION_TIMED_OUT: "operation_timed_out",
} as const);

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const OperationKind = Object.freeze({
  CHECKOUT: "checkout",
  CARD_SAVING: "card_saving",
} as const);

export type OperationKind = (typeof OperationKind)[keyof typeof OperationKind];
