import { asObject, asString, assertExactKeys, type JsonObject } from "../core/validation";
import type {
  PaymentMethodSetupResponse,
  PaymentMethodSetupStatus,
  PaymentMethodStatus,
  StoredPaymentMethod,
} from "./types";

const setupStatuses = new Set<PaymentMethodSetupStatus>([
  "processing",
  "requires_action",
  "succeeded",
  "failed",
  "expired",
]);
const methodStatuses = new Set<PaymentMethodStatus>([
  "active",
  "replacement_required",
  "revoked",
  "permanently_invalid",
]);

export function parsePaymentMethodSetup(value: unknown): PaymentMethodSetupResponse {
  const object = asObject(value, "Payment method setup");
  const keys = ["id", "status", "expiresAt", "actions"];
  if ("presentationVersion" in object) keys.push("presentationVersion");
  if ("presentation" in object) keys.push("presentation");
  if ("paymentMethod" in object) keys.push("paymentMethod");
  assertExactKeys(object, keys, "Payment method setup");
  const status = asString(object.status, "status") as PaymentMethodSetupStatus;
  if (!setupStatuses.has(status)) throw new TypeError("Payment method setup status is invalid");
  const id = nonEmpty(object.id, "id");
  const actions = parseActions(object.actions, id);
  const setup: PaymentMethodSetupResponse = {
    id,
    status,
    expiresAt: dateTime(object.expiresAt, "expiresAt"),
    actions,
  };
  if ((object.presentation === undefined) !== (object.presentationVersion === undefined)) {
    throw new TypeError("Payment method setup presentation is incomplete");
  }
  if (object.presentationVersion !== undefined && object.presentationVersion !== 1) {
    throw new TypeError("Payment method setup presentation version is invalid");
  }
  if (object.presentation !== undefined) {
    setup.presentationVersion = 1;
    setup.presentation = parsePresentation(object.presentation);
  }
  if (object.paymentMethod !== undefined) {
    setup.paymentMethod = parsePaymentMethod(object.paymentMethod);
  }
  if (status === "requires_action" && (!setup.presentation || !actions.confirm)) {
    throw new TypeError("Payment method setup presentation is required");
  }
  if (status !== "requires_action" && (setup.presentation || actions.confirm)) {
    throw new TypeError("Payment method setup presentation is unavailable");
  }
  if (status === "succeeded" && (!setup.paymentMethod || setup.paymentMethod.status !== "active")) {
    throw new TypeError("Succeeded setup requires an active payment method");
  }
  return setup;
}

function parsePresentation(value: unknown): { kind: "redirect"; url: string } {
  const object = asObject(value, "Payment method presentation");
  assertExactKeys(object, ["kind", "url"], "Payment method presentation");
  if (object.kind !== "redirect") throw new TypeError("Payment method presentation is invalid");
  const url = asString(object.url, "url");
  if (url.length > 4_096) throw new TypeError("Payment method presentation URL is too long");
  return { kind: "redirect", url };
}

function parseActions(value: unknown, id: string): PaymentMethodSetupResponse["actions"] {
  const object = asObject(value, "Payment method setup actions");
  const keys = ["status"];
  if ("confirm" in object) keys.push("confirm");
  assertExactKeys(object, keys, "Payment method setup actions");
  const base = `/public/v1/payment-method-setups/${id}`;
  const status = asObject(object.status, "Payment method status action");
  assertExactKeys(status, ["method", "url"], "Payment method status action");
  if (status.method !== "GET" || status.url !== base) {
    throw new TypeError("Payment method status action is unbound");
  }
  if (object.confirm === undefined) return { status: { method: "GET", url: base } };
  const confirm = asObject(object.confirm, "Payment method confirm action");
  assertExactKeys(confirm, ["method", "url"], "Payment method confirm action");
  if (confirm.method !== "POST" || confirm.url !== `${base}/confirm`) {
    throw new TypeError("Payment method confirm action is unbound");
  }
  return {
    status: { method: "GET", url: base },
    confirm: { method: "POST", url: `${base}/confirm` },
  };
}

function parsePaymentMethod(value: unknown): StoredPaymentMethod {
  const object = asObject(value, "Payment method");
  const keys = ["id", "status", "createdAt", "updatedAt"];
  for (const key of ["brand", "lastDigits", "expiry"]) if (key in object) keys.push(key);
  assertExactKeys(object, keys, "Payment method");
  const status = asString(object.status, "status") as PaymentMethodStatus;
  if (!methodStatuses.has(status)) throw new TypeError("Payment method status is invalid");
  return {
    id: nonEmpty(object.id, "id"),
    status,
    ...(object.brand === undefined ? {} : { brand: asString(object.brand, "brand") }),
    ...(object.lastDigits === undefined ? {} : { lastDigits: lastDigits(object.lastDigits) }),
    ...(object.expiry === undefined ? {} : { expiry: expiry(object.expiry) }),
    createdAt: dateTime(object.createdAt, "createdAt"),
    updatedAt: dateTime(object.updatedAt, "updatedAt"),
  };
}

function expiry(value: unknown): { month: number; year: number } {
  const object: JsonObject = asObject(value, "Payment method expiry");
  assertExactKeys(object, ["month", "year"], "Payment method expiry");
  if (!Number.isInteger(object.month)) {
    throw new TypeError("Payment method expiry month is invalid");
  }
  if (!Number.isInteger(object.year)) {
    throw new TypeError("Payment method expiry year is invalid");
  }
  return { month: Number(object.month), year: Number(object.year) };
}

function lastDigits(value: unknown): string {
  const digits = asString(value, "lastDigits");
  if (!/^\d{4}$/.test(digits)) throw new TypeError("Payment method lastDigits is invalid");
  return digits;
}

function nonEmpty(value: unknown, field: string): string {
  const result = asString(value, field);
  if (!result) throw new TypeError(`${field} must not be empty`);
  return result;
}

function dateTime(value: unknown, field: string): string {
  const result = asString(value, field);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(result) ||
    Number.isNaN(Date.parse(result))
  ) {
    throw new TypeError(`${field} must be an RFC3339 UTC date-time`);
  }
  return result;
}
