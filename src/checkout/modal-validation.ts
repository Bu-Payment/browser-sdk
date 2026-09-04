import { asObject, asString, assertExactKeys, type JsonObject } from "../core/validation";
import type { ModalPresentation, ModalVerificationField } from "./types";

const scriptUrl = "https://payment.tmtprotects.com/tmt-payment-modal.3.6.1.js";
const verificationFields = new Set<ModalVerificationField>([
  "allocations",
  "charge_channel",
  "country",
  "date",
  "email",
  "firstname",
  "reference",
  "surname",
]);

export function parseModalPresentation(object: JsonObject): ModalPresentation {
  assertExactKeys(
    object,
    ["kind", "adapter", "resource", "configuration", "authorization"],
    "Modal presentation",
  );
  if (object.adapter !== "trust-my-travel-payment-modal") invalid("adapter");
  const resource = parseResource(object.resource);
  const configuration = parseConfiguration(object.configuration);
  const authorization = parseAuthorization(object.authorization);
  return {
    kind: "modal",
    adapter: "trust-my-travel-payment-modal",
    resource,
    configuration,
    authorization,
  };
}

function parseResource(value: unknown): ModalPresentation["resource"] {
  const object = asObject(value, "Modal resource");
  assertExactKeys(object, ["url", "version"], "Modal resource");
  if (object.url !== scriptUrl || object.version !== "3.6.1") invalid("resource");
  return { url: scriptUrl, version: "3.6.1" };
}

function parseConfiguration(value: unknown): ModalPresentation["configuration"] {
  const object = asObject(value, "Modal configuration");
  const keys = ["path", "environment", "booking", "payer"];
  for (const key of ["description", "passengerCount", "transactionType"]) {
    if (key in object) keys.push(key);
  }
  assertExactKeys(object, keys, "Modal configuration");
  const path = limitedString(object.path, "path", 255);
  if (!/^\/?[A-Za-z0-9][A-Za-z0-9_-]*(?:\/[A-Za-z0-9][A-Za-z0-9_-]*)*\/?$/.test(path)) {
    invalid("path");
  }
  if (object.environment !== "test" && object.environment !== "live") invalid("environment");
  const description = optionalString(object.description, "description", 191);
  const passengerCount = optionalPositiveInteger(object.passengerCount, "passengerCount");
  if (object.transactionType !== undefined && object.transactionType !== "authorize") {
    invalid("transactionType");
  }
  return {
    path,
    environment: object.environment,
    booking: parseBooking(object.booking),
    payer: parsePayer(object.payer),
    ...(description === undefined ? {} : { description }),
    ...(passengerCount === undefined ? {} : { passengerCount }),
    ...(object.transactionType === undefined ? {} : { transactionType: "authorize" }),
  };
}

function parseBooking(value: unknown): ModalPresentation["configuration"]["booking"] {
  const object = asObject(value, "Modal booking");
  assertExactKeys(
    object,
    ["id", "channelId", "currency", "amount", "allocations", "reference"],
    "Modal booking",
  );
  const currency = limitedString(object.currency, "currency", 3);
  if (!/^[A-Z]{3}$/.test(currency)) invalid("currency");
  if (!Array.isArray(object.allocations) || object.allocations.length !== 0) {
    invalid("allocations");
  }
  return {
    id: positiveInteger(object.id, "id"),
    channelId: positiveInteger(object.channelId, "channelId"),
    currency,
    amount: positiveInteger(object.amount, "amount"),
    allocations: [],
    reference: limitedString(object.reference, "reference", 255),
  };
}

function parsePayer(value: unknown): ModalPresentation["configuration"]["payer"] {
  const object = asObject(value, "Modal payer");
  assertExactKeys(
    object,
    ["name", "email", "address", "city", "postalCode", "country"],
    "Modal payer",
  );
  const email = limitedString(object.email, "email", 320);
  const country = limitedString(object.country, "country", 2);
  if (!email.includes("@") || !/^[A-Z]{2}$/.test(country)) invalid("payer");
  return {
    name: limitedString(object.name, "name", 191),
    email,
    address: limitedString(object.address, "address", 50),
    city: limitedString(object.city, "city", 45),
    postalCode: limitedString(object.postalCode, "postalCode", 50),
    country,
  };
}

function parseAuthorization(value: unknown): ModalPresentation["authorization"] {
  const object = asObject(value, "Modal authorization");
  assertExactKeys(object, ["value", "verificationFields", "expiresAt"], "Modal authorization");
  const authorization = asString(object.value, "authorization.value");
  if (!/^[a-f0-9]{64}\d{14}$/.test(authorization)) invalid("authorization");
  if (!Array.isArray(object.verificationFields) || object.verificationFields.length > 8) {
    invalid("verificationFields");
  }
  const fields = object.verificationFields.map((field) => {
    if (typeof field !== "string" || !verificationFields.has(field as ModalVerificationField)) {
      invalid("verificationFields");
    }
    return field as ModalVerificationField;
  });
  if (new Set(fields).size !== fields.length) invalid("verificationFields");
  const expiresAt = asString(object.expiresAt, "authorization.expiresAt");
  if (Number.isNaN(Date.parse(expiresAt))) invalid("authorization.expiresAt");
  return { value: authorization, verificationFields: fields, expiresAt };
}

function limitedString(value: unknown, field: string, maximum: number): string {
  const result = asString(value, field);
  if (!result || result.length > maximum) invalid(field);
  return result;
}

function optionalString(value: unknown, field: string, maximum: number): string | undefined {
  return value === undefined ? undefined : limitedString(value, field, maximum);
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) invalid(field);
  return Number(value);
}

function optionalPositiveInteger(value: unknown, field: string): number | undefined {
  return value === undefined ? undefined : positiveInteger(value, field);
}

function invalid(field: string): never {
  throw new TypeError(`Modal ${field} is invalid`);
}
