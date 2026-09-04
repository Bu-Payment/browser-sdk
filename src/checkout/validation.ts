import { asObject, asString, assertExactKeys } from "../core/validation";
import { parseModalPresentation } from "./modal-validation";
import type {
  CheckoutActions,
  CheckoutCreated,
  CheckoutLifecycle,
  CheckoutStatus,
  CheckoutType,
  CreateCheckoutInput,
  ModalPresentation,
  RedirectPresentation,
} from "./types";

const checkoutStatuses = new Set<CheckoutStatus>([
  "pending",
  "processing",
  "completed",
  "failed",
  "expired",
  "cancelled",
]);

export function parseCreateCheckoutInput(value: unknown): CreateCheckoutInput {
  const object = asObject(value, "Checkout input");
  assertExactKeys(object, ["priceId", "email", "quantity", "destinationKey"], "Checkout input");
  const priceId = asString(object.priceId, "priceId").trim();
  const email = asString(object.email, "email").trim();
  const destinationKey = asString(object.destinationKey, "destinationKey");
  if (!priceId || priceId.length > 255) throw new TypeError("priceId is invalid");
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new TypeError("email is invalid");
  }
  if (
    !Number.isInteger(object.quantity) ||
    Number(object.quantity) < 1 ||
    Number(object.quantity) > 100
  ) {
    throw new TypeError("quantity must be an integer from 1 to 100");
  }
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(destinationKey)) {
    throw new TypeError("destinationKey is invalid");
  }
  return { priceId, email, quantity: Number(object.quantity), destinationKey };
}

export function parseCheckoutCreated(value: unknown): CheckoutCreated {
  const object = asObject(value, "Checkout");
  const keys = ["reference", "type", "status", "actions", "createdAt", "expiresAt"];
  if ("presentationVersion" in object) keys.push("presentationVersion");
  if ("presentation" in object) keys.push("presentation");
  if ("checkoutUrl" in object) keys.push("checkoutUrl");
  assertExactKeys(object, keys, "Checkout");
  const reference = asString(object.reference, "reference");
  const status = parseCheckoutStatus(object.status);
  const actions = parseActions(object.actions, reference);
  const active = status === "pending" || status === "processing";
  if (
    active !== (object.presentation !== undefined) ||
    active !== (object.presentationVersion === 1)
  ) {
    throw new TypeError("Checkout presentation availability is invalid");
  }
  const presentation = active ? parsePresentation(object.presentation) : undefined;
  const checkoutUrl = object.checkoutUrl;
  if (presentation?.kind === "redirect" && checkoutUrl !== presentation.url) {
    throw new TypeError("checkoutUrl must match redirect presentation URL");
  }
  if (presentation?.kind !== "redirect" && checkoutUrl !== undefined) {
    throw new TypeError("checkoutUrl is redirect-only");
  }
  if ((presentation?.kind === "modal") !== (actions.callback !== undefined)) {
    throw new TypeError("Checkout callback availability is invalid");
  }
  return {
    reference,
    type: parseCheckoutType(object.type),
    status,
    actions,
    ...(presentation ? { presentationVersion: 1 as const, presentation } : {}),
    ...(checkoutUrl === undefined ? {} : { checkoutUrl: asString(checkoutUrl, "checkoutUrl") }),
    createdAt: parseDate(object.createdAt, "createdAt"),
    expiresAt: parseDate(object.expiresAt, "expiresAt"),
  };
}

export function parseCheckoutLifecycle(value: unknown): CheckoutLifecycle {
  const object = asObject(value, "Checkout lifecycle");
  const keys = ["reference", "type", "status", "actions", "createdAt", "updatedAt", "expiresAt"];
  if ("presentationVersion" in object) keys.push("presentationVersion");
  if ("presentation" in object) keys.push("presentation");
  assertExactKeys(object, keys, "Checkout lifecycle");
  const reference = asString(object.reference, "reference");
  const status = parseCheckoutStatus(object.status);
  const actions = parseActions(object.actions, reference);
  const active = status === "pending" || status === "processing";
  if (
    active !== (object.presentation !== undefined) ||
    active !== (object.presentationVersion === 1)
  ) {
    throw new TypeError("Checkout lifecycle presentation availability is invalid");
  }
  const presentation = active ? parsePresentation(object.presentation) : undefined;
  if ((presentation?.kind === "modal") !== (actions.callback !== undefined)) {
    throw new TypeError("Checkout lifecycle callback availability is invalid");
  }
  return {
    reference,
    type: parseCheckoutType(object.type),
    status,
    actions,
    ...(presentation ? { presentationVersion: 1 as const, presentation } : {}),
    createdAt: parseDate(object.createdAt, "createdAt"),
    updatedAt: parseDate(object.updatedAt, "updatedAt"),
    expiresAt: parseDate(object.expiresAt, "expiresAt"),
  };
}

function parsePresentation(value: unknown): RedirectPresentation | ModalPresentation {
  const object = asObject(value, "Checkout presentation");
  if (object.kind === "redirect") {
    assertExactKeys(object, ["kind", "url"], "Redirect presentation");
    const url = asString(object.url, "url");
    if (url.length > 4_096) throw new TypeError("Checkout presentation URL is too long");
    return { kind: "redirect", url };
  }
  if (object.kind !== "modal") throw new TypeError("Checkout presentation kind is invalid");
  return parseModalPresentation(object);
}

function parseActions(value: unknown, reference: string): CheckoutActions {
  const object = asObject(value, "Checkout actions");
  const keys = ["status"];
  if ("callback" in object) keys.push("callback");
  assertExactKeys(object, keys, "Checkout actions");
  const status = asObject(object.status, "Checkout status action");
  assertExactKeys(status, ["method", "url"], "Checkout status action");
  const base = `/public/v1/checkouts/${reference}`;
  if (status.method !== "GET" || status.url !== base)
    throw new TypeError("Status action is unbound");
  if (object.callback === undefined) return { status: { method: "GET", url: base } };
  const callback = asObject(object.callback, "Checkout callback action");
  assertExactKeys(callback, ["method", "url", "token"], "Checkout callback action");
  if (
    callback.method !== "POST" ||
    callback.url !== `${base}/callback` ||
    callback.token !== reference
  ) {
    throw new TypeError("Callback action is unbound");
  }
  return {
    status: { method: "GET", url: base },
    callback: { method: "POST", url: `${base}/callback`, token: reference },
  };
}

function parseCheckoutType(value: unknown): CheckoutType {
  if (value !== "payment" && value !== "subscription")
    throw new TypeError("Checkout type is invalid");
  return value;
}

function parseCheckoutStatus(value: unknown): CheckoutStatus {
  const status = asString(value, "status") as CheckoutStatus;
  if (!checkoutStatuses.has(status)) throw new TypeError("Checkout status is invalid");
  return status;
}

function parseDate(value: unknown, field: string): string {
  const date = asString(value, field);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(date) ||
    Number.isNaN(Date.parse(date))
  ) {
    throw new TypeError(`${field} must be an RFC3339 UTC date-time`);
  }
  return date;
}
