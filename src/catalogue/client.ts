import { ErrorCode } from "../constants";
import type { HttpClient } from "../core/http";
import { toBuPaymentError } from "../errors";
import { catalogueResponse, parsePage, parsePrice, parseProduct } from "./response";
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
    list: () => createCatalogueListBuilder(http, {}, includeProductPrices),
    product: (productId: string) =>
      createCatalogueProductBuilder(http, productId, undefined, includeSingleProductPrices),
    prices: () => createCataloguePricesBuilder(http, {}),
  });
}

type ProductPageResolver<TProduct extends Product> = (
  http: HttpClient,
  products: Product[],
  signal?: AbortSignal,
) => Promise<TProduct[]>;

type ProductResolver<TProduct extends Product> = (
  http: HttpClient,
  product: Product,
  signal?: AbortSignal,
) => Promise<TProduct>;

function createCatalogueListBuilder<TProduct extends Product>(
  http: HttpClient,
  options: Readonly<ListOptions>,
  resolveProducts: ProductPageResolver<TProduct>,
): CatalogueListBuilder<TProduct> {
  const next = (nextOptions: Readonly<ListOptions>) =>
    createCatalogueListBuilder(http, nextOptions, resolveProducts);
  return Object.freeze({
    cursor: (cursor: string) => next({ ...options, cursor }),
    limit: (limit: number) => next({ ...options, limit }),
    signal: (signal: AbortSignal) => next({ ...options, signal }),
    withoutPrices: () => createCatalogueListBuilder(http, options, resolveProductMetadataPage),
    get: async () => {
      const query = catalogueInput(() => buildListQuery(options));
      const value = await http.request(`public/v1/catalogue/products${query}`, {
        ...(options.signal ? { signal: options.signal } : {}),
      });
      const page = catalogueResponse(() => parsePage(value, parseProduct));
      const products = await resolveProducts(http, page.data, options.signal);
      return { products, pagination: { nextCursor: page.nextCursor } };
    },
  });
}

function createCatalogueProductBuilder<TProduct extends Product>(
  http: HttpClient,
  productId: string,
  signal: AbortSignal | undefined,
  resolveProduct: ProductResolver<TProduct>,
): CatalogueProductBuilder<TProduct> {
  return Object.freeze({
    signal: (nextSignal: AbortSignal) =>
      createCatalogueProductBuilder(http, productId, nextSignal, resolveProduct),
    withoutPrices: () =>
      createCatalogueProductBuilder(http, productId, signal, resolveProductMetadata),
    get: async () => {
      if (!productId.trim()) {
        throw toBuPaymentError(
          new TypeError("productId must not be empty"),
          ErrorCode.VALIDATION_FAILED,
          "Catalogue input is invalid",
        );
      }
      const value = await http.request(
        `public/v1/catalogue/products/${encodeURIComponent(productId)}`,
        signal ? { signal } : {},
      );
      const product = catalogueResponse(() => parseProduct(value));
      return resolveProduct(http, product, signal);
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

async function resolveProductMetadataPage(_http: HttpClient, products: Product[]) {
  return products;
}

async function resolveProductMetadata(_http: HttpClient, product: Product) {
  return product;
}

async function includeProductPrices(
  http: HttpClient,
  products: Product[],
  signal?: AbortSignal,
): Promise<ProductWithPrices[]> {
  if (products.length === 0) return [];
  const productIds = new Set(products.map(({ id }) => id));
  const pricesByProduct = new Map<string, Price[]>();
  for (const price of await listAllPrices(http, signal)) {
    if (!productIds.has(price.productId)) continue;
    const prices = pricesByProduct.get(price.productId) ?? [];
    prices.push(price);
    pricesByProduct.set(price.productId, prices);
  }
  return products.map((product) => ({
    ...product,
    prices: pricesByProduct.get(product.id) ?? [],
  }));
}

async function includeSingleProductPrices(
  http: HttpClient,
  product: Product,
  signal?: AbortSignal,
): Promise<ProductWithPrices> {
  const prices = await listAllPrices(http, signal, product.id);
  return { ...product, prices };
}

async function listAllPrices(
  http: HttpClient,
  signal?: AbortSignal,
  productId?: string,
): Promise<Price[]> {
  const prices: Price[] = [];
  let cursor: string | undefined;
  do {
    const query = catalogueInput(() =>
      buildListQuery({ limit: 100, ...(cursor ? { cursor } : {}) }, productId),
    );
    const value = await http.request(`public/v1/catalogue/prices${query}`, {
      ...(signal ? { signal } : {}),
    });
    const page = catalogueResponse(() => parsePage(value, parsePrice));
    prices.push(...page.data);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return prices;
}
