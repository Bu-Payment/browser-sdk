import { asObject, asString, assertExactKeys, type JsonObject } from "../core/validation";
import type {
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
  const keys = [
    "reference",
    "type",
    "status",
    "presentationVersion",
    "presentation",
    "createdAt",
    "expiresAt",
  ];
  if ("checkoutUrl" in object) keys.push("checkoutUrl");
  assertExactKeys(object, keys, "Checkout");
  const presentation = parsePresentation(object.presentation);
  if (object.status !== "pending" || object.presentationVersion !== 1) {
    throw new TypeError("Checkout status or presentation version is invalid");
  }
  const checkoutUrl = object.checkoutUrl;
  if (presentation.kind === "redirect" && checkoutUrl !== presentation.url) {
    throw new TypeError("checkoutUrl must match redirect presentation URL");
  }
  if (presentation.kind === "modal" && checkoutUrl !== undefined) {
    throw new TypeError("checkoutUrl is redirect-only");
  }
  return {
    reference: asString(object.reference, "reference"),
    type: parseCheckoutType(object.type),
    status: "pending",
    presentationVersion: 1,
    presentation,
    ...(checkoutUrl === undefined ? {} : { checkoutUrl: asString(checkoutUrl, "checkoutUrl") }),
    createdAt: parseDate(object.createdAt, "createdAt"),
    expiresAt: parseDate(object.expiresAt, "expiresAt"),
  };
}

export function parseCheckoutLifecycle(value: unknown): CheckoutLifecycle {
  const object = asObject(value, "Checkout lifecycle");
  assertExactKeys(
    object,
    ["reference", "type", "status", "createdAt", "updatedAt", "expiresAt"],
    "Checkout lifecycle",
  );
  const status = asString(object.status, "status") as CheckoutStatus;
  if (!checkoutStatuses.has(status)) throw new TypeError("Checkout status is invalid");
  return {
    reference: asString(object.reference, "reference"),
    type: parseCheckoutType(object.type),
    status,
    createdAt: parseDate(object.createdAt, "createdAt"),
    updatedAt: parseDate(object.updatedAt, "updatedAt"),
    expiresAt: parseDate(object.expiresAt, "expiresAt"),
  };
}

function parsePresentation(value: unknown): RedirectPresentation | ModalPresentation {
  const object = asObject(value, "Checkout presentation");
  if (object.kind === "redirect") {
    assertExactKeys(object, ["kind", "url"], "Redirect presentation");
    return { kind: "redirect", url: asString(object.url, "url") };
  }
  if (object.kind !== "modal") throw new TypeError("Checkout presentation kind is invalid");
  assertExactKeys(object, ["kind", "script", "configuration", "callback"], "Modal presentation");
  return parseModal(object);
}

function parseModal(object: JsonObject): ModalPresentation {
  const script = asObject(object.script, "Modal script");
  assertExactKeys(script, ["url"], "Modal script");
  if (script.url !== "https://payment.tmtprotects.com/tmt-payment-modal.3.6.1.js") {
    throw new TypeError("Modal script is not allowlisted");
  }
  const configuration = asObject(object.configuration, "Modal configuration");
  assertExactKeys(
    configuration,
    ["sessionToken", "amount", "currency", "reference"],
    "Modal configuration",
  );
  if (!Number.isSafeInteger(configuration.amount) || Number(configuration.amount) < 1) {
    throw new TypeError("Modal amount is invalid");
  }
  const currency = asString(configuration.currency, "currency");
  if (!/^[A-Z]{3}$/.test(currency)) throw new TypeError("Modal currency is invalid");
  const callback = asObject(object.callback, "Modal callback");
  assertExactKeys(callback, ["url", "token"], "Modal callback");
  return {
    kind: "modal",
    script: { url: script.url },
    configuration: {
      sessionToken: asString(configuration.sessionToken, "sessionToken"),
      amount: Number(configuration.amount),
      currency,
      reference: asString(configuration.reference, "reference"),
    },
    callback: {
      url: asString(callback.url, "callback.url"),
      token: asString(callback.token, "token"),
    },
  };
}

function parseCheckoutType(value: unknown): CheckoutType {
  if (value !== "payment" && value !== "subscription")
    throw new TypeError("Checkout type is invalid");
  return value;
}

function parseDate(value: unknown, field: string): string {
  const date = asString(value, field);
  if (Number.isNaN(Date.parse(date))) throw new TypeError(`${field} must be an ISO date-time`);
  return date;
}
