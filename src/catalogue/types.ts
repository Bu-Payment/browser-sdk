export interface CataloguePage<T> {
  data: T[];
  nextCursor: string | null;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
}

export interface Price {
  id: string;
  productId: string;
  unitAmount: number;
  currency: string;
  type: "one_time" | "recurring";
  recurring: null | { interval: "day" | "week" | "month" | "year"; intervalCount: number };
  description: string | null;
  lookupKey: string | null;
}
