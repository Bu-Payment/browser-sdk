import { ErrorCode } from "../constants";
import type { HttpClient } from "../core/http";
import {
  asNullableString,
  asObject,
  asString,
  assertExactKeys,
  type JsonObject,
} from "../core/validation";
import { toBuPaymentError } from "../errors";
import type {
  CataloguePage,
  CatalogueProductPage,
  Price,
  Product,
  ProductWithPrices,
} from "./types";

interface ListOptions {
  cursor?: string;
  limit?: number;
  signal?: AbortSignal;
}

interface PriceListOptions extends ListOptions {
  productId?: string;
}

export interface CatalogueListBuilder<TProduct extends Product = ProductWithPrices> {
  cursor(cursor: string): CatalogueListBuilder<TProduct>;
  limit(limit: number): CatalogueListBuilder<TProduct>;
  signal(signal: AbortSignal): CatalogueListBuilder<TProduct>;
  withoutPrices(): CatalogueListBuilder<Product>;
  get(): Promise<CatalogueProductPage<TProduct>>;
}

export interface CatalogueProductBuilder<TProduct extends Product = ProductWithPrices> {
  signal(signal: AbortSignal): CatalogueProductBuilder<TProduct>;
  withoutPrices(): CatalogueProductBuilder<Product>;
  get(): Promise<TProduct>;
}

export interface CataloguePricesBuilder {
  cursor(cursor: string): CataloguePricesBuilder;
  limit(limit: number): CataloguePricesBuilder;
  productId(productId: string): CataloguePricesBuilder;
  signal(signal: AbortSignal): CataloguePricesBuilder;
  get(): Promise<CataloguePage<Price>>;
}

export interface CatalogueClient {
  list(): CatalogueListBuilder<ProductWithPrices>;
  product(productId: string): CatalogueProductBuilder<ProductWithPrices>;
  prices(): CataloguePricesBuilder;
}

export function createCatalogueClient(http: HttpClient): CatalogueClient {
  return Object.freeze({
    list: () => createCatalogueListBuilder(http, {}, parseProductWithPrices, true),
    product: (productId: string) =>
      createCatalogueProductBuilder(http, productId, undefined, parseProductWithPrices, true),
    prices: () => createCataloguePricesBuilder(http, {}),
  });
}

function createCatalogueListBuilder<TProduct extends Product>(
  http: HttpClient,
  options: Readonly<ListOptions>,
  parseItem: (value: unknown) => TProduct,
  includePrices: boolean,
): CatalogueListBuilder<TProduct> {
  const next = (nextOptions: Readonly<ListOptions>) =>
    createCatalogueListBuilder(http, nextOptions, parseItem, includePrices);
  return Object.freeze({
    cursor: (cursor: string) => next({ ...options, cursor }),
    limit: (limit: number) => next({ ...options, limit }),
    signal: (signal: AbortSignal) => next({ ...options, signal }),
    withoutPrices: () => createCatalogueListBuilder(http, options, parseProduct, false),
    get: async () => {
      const query = catalogueInput(() => buildListQuery(options, undefined, includePrices));
      const value = await http.request(`public/v1/catalogue/products${query}`, {
        ...(options.signal ? { signal: options.signal } : {}),
      });
      const page = catalogueResponse(() => parsePage(value, parseItem));
      return { products: page.data, pagination: { nextCursor: page.nextCursor } };
    },
  });
}

function createCatalogueProductBuilder<TProduct extends Product>(
  http: HttpClient,
  productId: string,
  signal: AbortSignal | undefined,
  parseItem: (value: unknown) => TProduct,
  includePrices: boolean,
): CatalogueProductBuilder<TProduct> {
  return Object.freeze({
    signal: (nextSignal: AbortSignal) =>
      createCatalogueProductBuilder(http, productId, nextSignal, parseItem, includePrices),
    withoutPrices: () =>
      createCatalogueProductBuilder(http, productId, signal, parseProduct, false),
    get: async () => {
      if (!productId.trim()) {
        throw toBuPaymentError(
          new TypeError("productId must not be empty"),
          ErrorCode.VALIDATION_FAILED,
          "Catalogue input is invalid",
        );
      }
      const query = includePrices ? "" : "?include=none";
      const value = await http.request(
        `public/v1/catalogue/products/${encodeURIComponent(productId)}${query}`,
        signal ? { signal } : {},
      );
      return catalogueResponse(() => parseItem(value));
    },
  });
}

function createCataloguePricesBuilder(
  http: HttpClient,
  options: Readonly<PriceListOptions>,
): CataloguePricesBuilder {
  const next = (nextOptions: Readonly<PriceListOptions>) =>
    createCataloguePricesBuilder(http, nextOptions);
  return Object.freeze({
    cursor: (cursor: string) => next({ ...options, cursor }),
    limit: (limit: number) => next({ ...options, limit }),
    productId: (productId: string) => next({ ...options, productId }),
    signal: (signal: AbortSignal) => next({ ...options, signal }),
    get: async () => {
      const query = catalogueInput(() => buildListQuery(options, options.productId));
      const value = await http.request(`public/v1/catalogue/prices${query}`, {
        ...(options.signal ? { signal: options.signal } : {}),
      });
      return catalogueResponse(() => parsePage(value, parsePrice));
    },
  });
}

function catalogueInput<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    throw toBuPaymentError(error, ErrorCode.VALIDATION_FAILED, "Catalogue input is invalid");
  }
}

function catalogueResponse<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    throw toBuPaymentError(error, ErrorCode.RESPONSE_INVALID, "Catalogue response is invalid");
  }
}

function buildListQuery(options: ListOptions, productId?: string, includePrices?: boolean): string {
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
  if (includePrices === false) query.set("include", "none");
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

function parseProductWithPrices(value: unknown): ProductWithPrices {
  const object = asObject(value, "Product");
  assertExactKeys(object, ["id", "name", "description", "prices"], "Product");
  if (!Array.isArray(object.prices)) throw new TypeError("Product prices must be an array");
  return {
    id: asString(object.id, "id"),
    name: asString(object.name, "name"),
    description: asNullableString(object.description, "description"),
    prices: object.prices.map(parsePrice),
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
  const fields = {
    id: asString(object.id, "id"),
    productId: asString(object.productId, "productId"),
    unitAmount: Number(object.unitAmount),
    currency: asString(object.currency, "currency"),
    description: asNullableString(object.description, "description"),
    lookupKey: asNullableString(object.lookupKey, "lookupKey"),
  };
  if (type === "one_time") {
    if (object.recurring !== null)
      throw new TypeError("One-time price recurring value must be null");
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
