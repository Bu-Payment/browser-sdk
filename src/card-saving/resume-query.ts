export const cardSavingVerificationParameter = "bu_customer_verification_token";

export const hasCardSavingVerificationQuery = (search: string) =>
  new URLSearchParams(search).has(cardSavingVerificationParameter);
