import type { HttpClient } from "../core/http";
import {
  asNullableString,
  asObject,
  asString,
  assertExactKeys,
  type JsonObject,
} from "../core/validation";
import type { CataloguePage, Price, Product } from "./types";

export interface ListOptions {
  cursor?: string;
  limit?: number;
  signal?: AbortSignal;
}

export interface PriceListOptions extends ListOptions {
  productId?: string;
}

export interface CatalogueClient {
  listProducts(options?: ListOptions): Promise<CataloguePage<Product>>;
  getProduct(productId: string, options?: { signal?: AbortSignal }): Promise<Product>;
  listPrices(options?: PriceListOptions): Promise<CataloguePage<Price>>;
}

export function createCatalogueClient(http: HttpClient): CatalogueClient {
  return {
    async listProducts(options = {}) {
      const query = buildListQuery(options);
      const value = await http.request(`public/v1/catalogue/products${query}`, {
        ...(options.signal ? { signal: options.signal } : {}),
      });
      return parsePage(value, parseProduct);
    },
    async getProduct(productId, options = {}) {
      if (!productId) throw new TypeError("productId must not be empty");
      const value = await http.request(
        `public/v1/catalogue/products/${encodeURIComponent(productId)}`,
        options.signal ? { signal: options.signal } : {},
      );
      return parseProduct(value);
    },
    async listPrices(options = {}) {
      const query = buildListQuery(options, options.productId);
      const value = await http.request(`public/v1/catalogue/prices${query}`, {
        ...(options.signal ? { signal: options.signal } : {}),
      });
      return parsePage(value, parsePrice);
    },
  };
}

function buildListQuery(options: ListOptions, productId?: string): string {
  if (
    options.limit !== undefined &&
    (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 100)
  ) {
    throw new RangeError("limit must be an integer from 1 to 100");
  }
  const query = new URLSearchParams();
  if (options.cursor !== undefined) {
    if (!options.cursor) throw new TypeError("cursor must not be empty");
    query.set("cursor", options.cursor);
  }
  if (options.limit !== undefined) query.set("limit", String(options.limit));
  if (productId !== undefined) {
    if (!productId.trim()) throw new TypeError("productId must not be empty");
    query.set("productId", productId);
  }
  const value = query.toString();
  return value ? `?${value}` : "";
}

function parsePage<T>(value: unknown, parseItem: (value: unknown) => T): CataloguePage<T> {
  const object = asObject(value, "Catalogue page");
  assertExactKeys(object, ["data", "nextCursor"], "Catalogue page");
  if (!Array.isArray(object.data)) throw new TypeError("Catalogue data must be an array");
  if (object.nextCursor !== null && typeof object.nextCursor !== "string") {
    throw new TypeError("Catalogue nextCursor must be a string or null");
  }
  return { data: object.data.map(parseItem), nextCursor: object.nextCursor as string | null };
}

function parseProduct(value: unknown): Product {
  const object = asObject(value, "Product");
  assertExactKeys(object, ["id", "name", "description"], "Product");
  return {
    id: asString(object.id, "id"),
    name: asString(object.name, "name"),
    description: asNullableString(object.description, "description"),
  };
}

function parsePrice(value: unknown): Price {
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
  return {
    id: asString(object.id, "id"),
    productId: asString(object.productId, "productId"),
    unitAmount: Number(object.unitAmount),
    currency: asString(object.currency, "currency"),
    type,
    recurring: parseRecurring(object.recurring, type),
    description: asNullableString(object.description, "description"),
    lookupKey: asNullableString(object.lookupKey, "lookupKey"),
  };
}

function parseRecurring(value: unknown, type: Price["type"]): Price["recurring"] {
  if (type === "one_time") {
    if (value !== null) throw new TypeError("One-time price recurring value must be null");
    return null;
  }
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
