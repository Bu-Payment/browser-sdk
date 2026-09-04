# Catalogue

The catalogue API exposes only products and prices assigned to the current application and
environment. All responses are validated at runtime and contain only the public fields documented
here.

## List products

```ts
const { products, pagination } = await buPayment.catalogue
  .list()
  .limit(25)
  .get();
```

`list()` returns `CatalogueListBuilder<ProductWithPrices>`. Its methods are:

```ts
cursor(cursor: string): CatalogueListBuilder<ProductWithPrices>
limit(limit: number): CatalogueListBuilder<ProductWithPrices>
signal(signal: AbortSignal): CatalogueListBuilder<ProductWithPrices>
withoutPrices(): CatalogueListBuilder<Product>
get(): Promise<CatalogueProductPage<ProductWithPrices>>
```

Prices are embedded by default in the same request. A product with no eligible price has
`prices: []`. Use `withoutPrices()` when only product metadata is needed:

```ts
const { products } = await buPayment.catalogue
  .list()
  .withoutPrices()
  .get();
```

The server default is 50 products. `limit()` accepts integers from 1 through 100. Cursors are
opaque; pass `pagination.nextCursor` unchanged to the next request:

```ts
const firstPage = await buPayment.catalogue.list().limit(25).get();

if (firstPage.pagination.nextCursor) {
  const secondPage = await buPayment.catalogue
    .list()
    .limit(25)
    .cursor(firstPage.pagination.nextCursor)
    .get();
}
```

## Retrieve one product

```ts
const product = await buPayment.catalogue
  .product("product_public_reference")
  .get();
```

`product(id).get()` returns `Promise<ProductWithPrices>`. Prices are included by default. The
metadata-only form returns `Promise<Product>`:

```ts
const product = await buPayment.catalogue
  .product("product_public_reference")
  .withoutPrices()
  .signal(abortController.signal)
  .get();
```

## List prices

```ts
const page = await buPayment.catalogue
  .prices()
  .productId("product_public_reference")
  .limit(25)
  .get();
```

`prices()` returns `CataloguePricesBuilder`. It supports `productId()`, `limit()`, `cursor()`,
`signal()`, and the terminal `get()`. The result is `Promise<CataloguePage<Price>>`, with `data` and
`nextCursor`. The server default is 50 prices and the accepted limit is 1 through 100.

`Price` is a discriminated union. After checking `price.type`, TypeScript narrows `recurring`
precisely:

```ts
for (const price of page.data) {
  if (price.type === "recurring") {
    console.log(price.recurring.interval, price.recurring.intervalCount);
  } else {
    console.log(price.recurring); // null
  }
}
```

## Cancellation

Every catalogue builder accepts an `AbortSignal`:

```ts
const request = buPayment.catalogue
  .list()
  .signal(abortController.signal)
  .get();

abortController.abort();
await request;
```

An aborted request is not retried and rejects with a `BuPaymentError` whose code is
`ErrorCode.OPERATION_CANCELLED`.
