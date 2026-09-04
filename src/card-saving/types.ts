import type { PaymentMethodSetup } from "../payment-methods/types";

export interface CardSavingChallenge {
  expiresAt: string;
}

interface CardSavingBuilderMethods<
  HasEmail extends boolean,
  HasCurrency extends boolean,
  HasConsent extends boolean,
> {
  email(email: string): CardSavingBuilder<true, HasCurrency, HasConsent>;
  currency(currency: string): CardSavingBuilder<HasEmail, true, HasConsent>;
  consent(consent: true): CardSavingBuilder<HasEmail, HasCurrency, true>;
  returnUrl(returnUrl: string): CardSavingBuilder<HasEmail, HasCurrency, HasConsent>;
  signal(signal: AbortSignal): CardSavingBuilder<HasEmail, HasCurrency, HasConsent>;
  timeoutMs(timeoutMs: number): CardSavingBuilder<HasEmail, HasCurrency, HasConsent>;
}

export type CardSavingBuilder<
  HasEmail extends boolean = false,
  HasCurrency extends boolean = false,
  HasConsent extends boolean = false,
> = CardSavingBuilderMethods<HasEmail, HasCurrency, HasConsent> &
  (HasEmail extends true
    ? HasCurrency extends true
      ? HasConsent extends true
        ? { start(): Promise<CardSavingChallenge> }
        : object
      : object
    : object);

export interface CardSavingClient extends CardSavingBuilder {
  status(): Promise<PaymentMethodSetup>;
}
