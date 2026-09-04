import type { HttpClient } from "../core/http";
import {
  asNullableString,
  asObject,
  asString,
  assertExactKeys,
  type JsonObject,
} from "../core/validation";
import type {
  CataloguePage,
  CatalogueProductPage,
  Price,
  Product,
  ProductWithPrices,
} from "./types";

export interface ListOptions {
  cursor?: string;
  limit?: number;
  signal?: AbortSignal;
}

export interface PriceListOptions extends ListOptions {
  productId?: string;
}

export interface CatalogueListBuilder<TProduct extends Product = ProductWithPrices> {
  cursor(cursor: string): CatalogueListBuilder<TProduct>;
  limit(limit: number): CatalogueListBuilder<TProduct>;
  signal(signal: AbortSignal): CatalogueListBuilder<TProduct>;
  withoutPrices(): CatalogueListBuilder<Product>;
  get(): Promise<CatalogueProductPage<TProduct>>;
}

export interface CatalogueClient {
  list(options?: ListOptions): CatalogueListBuilder<ProductWithPrices>;
  getProduct(productId: string, options?: { signal?: AbortSignal }): Promise<ProductWithPrices>;
  listPrices(options?: PriceListOptions): Promise<CataloguePage<Price>>;
}

export function createCatalogueClient(http: HttpClient): CatalogueClient {
  return {
    list(options = {}) {
      return new DefaultCatalogueListBuilder(http, { ...options }, parseProductWithPrices, true);
    },
    async getProduct(productId, options = {}) {
      if (!productId) throw new TypeError("productId must not be empty");
      const value = await http.request(
        `public/v1/catalogue/products/${encodeURIComponent(productId)}`,
        options.signal ? { signal: options.signal } : {},
      );
      return parseProductWithPrices(value);
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

class DefaultCatalogueListBuilder<TProduct extends Product>
  implements CatalogueListBuilder<TProduct>
{
  constructor(
    private readonly http: HttpClient,
    private readonly options: Readonly<ListOptions>,
    private readonly parseItem: (value: unknown) => TProduct,
    private readonly includePrices: boolean,
  ) {}

  cursor(cursor: string): CatalogueListBuilder<TProduct> {
    return this.withOptions({ ...this.options, cursor });
  }

  limit(limit: number): CatalogueListBuilder<TProduct> {
    return this.withOptions({ ...this.options, limit });
  }

  signal(signal: AbortSignal): CatalogueListBuilder<TProduct> {
    return this.withOptions({ ...this.options, signal });
  }

  withoutPrices(): CatalogueListBuilder<Product> {
    return new DefaultCatalogueListBuilder(this.http, this.options, parseProduct, false);
  }

  async get(): Promise<CatalogueProductPage<TProduct>> {
    const query = buildListQuery(this.options, undefined, this.includePrices);
    const value = await this.http.request(`public/v1/catalogue/products${query}`, {
      ...(this.options.signal ? { signal: this.options.signal } : {}),
    });
    const page = parsePage(value, this.parseItem);
    return {
      products: page.data,
      pagination: { nextCursor: page.nextCursor },
    };
  }

  private withOptions(options: Readonly<ListOptions>): CatalogueListBuilder<TProduct> {
    return new DefaultCatalogueListBuilder(this.http, options, this.parseItem, this.includePrices);
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
