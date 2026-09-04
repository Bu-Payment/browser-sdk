export interface CataloguePage<T> {
  data: T[];
  nextCursor: string | null;
}

export interface CataloguePagination {
  nextCursor: string | null;
}

export interface CatalogueProductPage<TProduct extends Product> {
  products: TProduct[];
  pagination: CataloguePagination;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
}

export interface ProductWithPrices extends Product {
  prices: Price[];
}

interface PriceFields {
  id: string;
  productId: string;
  unitAmount: number;
  currency: string;
  description: string | null;
  lookupKey: string | null;
}

export type Price = PriceFields &
  (
    | { type: "one_time"; recurring: null }
    | {
        type: "recurring";
        recurring: { interval: "day" | "week" | "month" | "year"; intervalCount: number };
      }
  );
