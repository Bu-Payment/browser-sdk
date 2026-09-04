import type { Price } from "../../src/catalogue/types";

export const catalogueSession = {
  token: "session",
  expiresAt: "2030-09-03T12:10:00.000Z",
  renewAfter: "2030-09-03T12:08:00.000Z",
  capabilities: ["catalogue:read", "checkout:create"],
};

export function price(fields: { id: string; productId: string; unitAmount: number }): Price {
  return {
    ...fields,
    currency: "EUR",
    type: "one_time",
    recurring: null,
    description: null,
    lookupKey: fields.id,
  };
}
