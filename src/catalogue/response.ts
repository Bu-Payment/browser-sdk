import { ErrorCode } from "../constants";
import {
  asNullableString,
  asObject,
  asString,
  assertExactKeys,
  type JsonObject,
} from "../core/validation";
import { toBuPaymentError } from "../errors";
import type { CataloguePage, Price, Product } from "./types";

export function catalogueResponse<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    throw toBuPaymentError(error, ErrorCode.RESPONSE_INVALID, "Catalogue response is invalid");
  }
}

export function parsePage<T>(value: unknown, parseItem: (value: unknown) => T): CataloguePage<T> {
  const object = asObject(value, "Catalogue page");
  assertExactKeys(object, ["data", "nextCursor"], "Catalogue page");
  if (!Array.isArray(object.data)) throw new TypeError("Catalogue data must be an array");
  if (object.nextCursor !== null && typeof object.nextCursor !== "string") {
    throw new TypeError("Catalogue nextCursor must be a string or null");
  }
  return { data: object.data.map(parseItem), nextCursor: object.nextCursor as string | null };
}

export function parseProduct(value: unknown): Product {
  const object = asObject(value, "Product");
  assertExactKeys(object, ["id", "name", "description"], "Product");
  return {
    id: asString(object.id, "id"),
    name: asString(object.name, "name"),
    description: asNullableString(object.description, "description"),
  };
}

export function parsePrice(value: unknown): Price {
  const object = asObject(value, "Price");
  assertExactKeys(
    object,
    ["id", "productId", "unitAmount", "currency", "type", "recurring", "description", "lookupKey"],
    "Price",
  );
  const type = asString(object.type, "type");
  if (type !== "one_time" && type !== "recurring") throw new TypeError("Price type is invalid");
  if (!Number.isSafeInteger(object.unitAmount) || Number(object.unitAmount) < 0) {
    throw new TypeError("unitAmount must be a non-negative safe integer");
  }
  const fields = {
    id: asString(object.id, "id"),
    productId: asString(object.productId, "productId"),
    unitAmount: Number(object.unitAmount),
    currency: asString(object.currency, "currency"),
    description: asNullableString(object.description, "description"),
    lookupKey: asNullableString(object.lookupKey, "lookupKey"),
  };
  if (type === "one_time") {
    if (object.recurring !== null) {
      throw new TypeError("One-time price recurring value must be null");
    }
    return { ...fields, type, recurring: null };
  }
  return { ...fields, type, recurring: parseRecurring(object.recurring) };
}

function parseRecurring(value: unknown): Extract<Price, { type: "recurring" }>["recurring"] {
  const object: JsonObject = asObject(value, "Recurring price");
  assertExactKeys(object, ["interval", "intervalCount"], "Recurring price");
  const interval = asString(object.interval, "interval");
  if (!["day", "week", "month", "year"].includes(interval)) {
    throw new TypeError("Recurring interval is invalid");
  }
  if (!Number.isSafeInteger(object.intervalCount) || Number(object.intervalCount) < 1) {
    throw new TypeError("intervalCount must be a positive safe integer");
  }
  return {
    interval: interval as "day" | "week" | "month" | "year",
    intervalCount: Number(object.intervalCount),
  };
}
