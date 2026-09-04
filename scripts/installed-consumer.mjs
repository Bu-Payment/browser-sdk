import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
execFileSync("bun", ["run", "build"], { cwd: projectRoot, stdio: "inherit" });

const consumerRoot = mkdtempSync(join(tmpdir(), "bu-payment-browser-sdk-consumer-"));
const archiveName = "bu-payment-browser-sdk.tgz";
const archivePath = join(consumerRoot, archiveName);
const bunEnvironment = { ...process.env, BUN_INSTALL_CACHE_DIR: join(consumerRoot, ".bun-cache") };
execFileSync("bun", ["pm", "pack", "--filename", archivePath, "--quiet"], {
  cwd: projectRoot,
  stdio: "inherit",
  env: bunEnvironment,
});
const publishedPaths = execFileSync("tar", ["-tzf", archivePath], { encoding: "utf8" })
  .trim()
  .split("\n")
  .map((path) => path.replace(/^package\//, ""))
  .sort();
const allowed = [
  "README.md",
  "dist/index.d.ts",
  "dist/index.js",
  "dist/index.js.map",
  "docs/card-saving.md",
  "docs/catalogue.md",
  "docs/checkout.md",
  "docs/concepts-and-authentication.md",
  "docs/errors.md",
  "docs/examples.md",
  "docs/idempotency.md",
  "docs/index.md",
  "docs/lifecycle-and-status.md",
  "docs/presentation-and-events.md",
  "docs/resume-and-cancellation.md",
  "docs/security.md",
  "package.json",
];
if (JSON.stringify(publishedPaths) !== JSON.stringify(allowed)) {
  throw new Error(`Unexpected package contents: ${publishedPaths.join(", ")}`);
}

writeFileSync(
  join(consumerRoot, "package.json"),
  JSON.stringify({ name: "installed-consumer", private: true, type: "module" }),
);
execFileSync("bun", ["add", "--ignore-scripts", archivePath], {
  cwd: consumerRoot,
  stdio: "inherit",
  env: bunEnvironment,
});

writeFileSync(
  join(consumerRoot, "consumer.mjs"),
  `import { createBuPaymentClient, SessionInvalidError } from "@bu-payment/browser-sdk";
if (typeof createBuPaymentClient !== "function") throw new Error("Missing client export");
if (!(new SessionInvalidError("invalid", { code: "application_session_invalid", status: 401 }) instanceof Error)) throw new Error("Invalid error export");
const client = createBuPaymentClient({ publishableKey: "bup_pk_test_sample", apiBaseUrl: "https://api.example.test", fetch: async () => Response.json({}) });
if (typeof client.checkout.presentation !== "function" || typeof client.checkout.resume !== "function" || typeof client.checkout.status !== "function") throw new Error("Missing checkout builder exports");
if ("present" in client.checkout || "getStatus" in client.checkout || "redirect" in client.checkout) throw new Error("Imperative checkout API was exported");
if ("getProduct" in client.catalogue || "listPrices" in client.catalogue) throw new Error("Imperative catalogue API was exported");
if ("start" in client.cardSaving || typeof client.cardSaving.email !== "function" || typeof client.cardSaving.resume !== "function" || typeof client.cardSaving.status !== "function") throw new Error("Invalid card saving builder API");
const readyCardSaving = client.cardSaving.email("buyer@example.com").currency("EUR").consent(true);
if (!Object.isFrozen(client.cardSaving) || !Object.isFrozen(readyCardSaving) || typeof readyCardSaving.start !== "function") throw new Error("Card saving builder is not immutable");
if ("paymentMethods" in client) throw new Error("Legacy payment method API was exported");
`,
);
execFileSync("bun", [join(consumerRoot, "consumer.mjs")], {
  cwd: consumerRoot,
  stdio: "inherit",
});

writeFileSync(
  join(consumerRoot, "consumer.ts"),
  `import { createBuPaymentClient, type CataloguePage, type CatalogueProductPage, type CheckoutLifecycle, type CheckoutStatus, type PaymentMethodSetup, type PresentationEvent, type PresentationHandle, type Price, type Product, type ProductWithPrices } from "@bu-payment/browser-sdk";
const client = createBuPaymentClient({ publishableKey: "bup_pk_test_sample", apiBaseUrl: "https://api.example.test" });
const status: CheckoutStatus = "completed";
const event: PresentationEvent = { type: "polling", flow: "payment_method_resume", status: "processing" };
// @ts-expect-error start is unavailable until all required values are configured.
client.cardSaving.start();
// @ts-expect-error consent must be the explicit literal true.
client.cardSaving.email("buyer@example.com").currency("EUR").consent(false);
const challenge: Promise<{ expiresAt: string }> = client.cardSaving.consent(true).currency("EUR").email("buyer@example.com").timeoutMs(1_000).start();
const paymentMethodStatus: Promise<PaymentMethodSetup> = client.cardSaving.status();
const paymentMethodResume: PresentationHandle<PaymentMethodSetup> = client.cardSaving.resume();
// @ts-expect-error resume has no public options object.
client.cardSaving.resume({ timeoutMs: 1_000 });
// @ts-expect-error status has no public options object.
client.cardSaving.status({ signal: new AbortController().signal });
const withPrices: Promise<CatalogueProductPage<ProductWithPrices>> = client.catalogue.list().limit(10).get();
const withoutPrices: Promise<CatalogueProductPage<Product>> = client.catalogue.list().withoutPrices().get();
const fluentCheckout = client.checkout.destinationKey("default").quantity(1).email("buyer@example.com").idempotencyKey("storefront-order-018f4f90a4c7").priceId("price_public_reference").create();
const product = client.catalogue.product("product_public_reference").get();
const prices: Promise<CataloguePage<Price>> = client.catalogue.prices().productId("product_public_reference").get();
const checkoutLifecycle: Promise<CheckoutLifecycle> = client.checkout.status("checkout_public_reference").get();
const checkoutHandle: PresentationHandle<CheckoutLifecycle> = client.checkout.presentation({} as never).onEvent(() => {}).timeoutMs(1_000).start();
const resumeHandle: PresentationHandle<CheckoutLifecycle> = client.checkout.resume().reference("checkout_public_reference").signal(new AbortController().signal).start();
void event;
void challenge;
void paymentMethodStatus;
void paymentMethodResume;
void withPrices;
void withoutPrices;
void fluentCheckout;
void product;
void prices;
void checkoutLifecycle;
void checkoutHandle;
void resumeHandle;
void status;
`,
);
execFileSync(
  "bun",
  [
    "x",
    "tsc",
    "--noEmit",
    "--strict",
    "--skipLibCheck",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "--target",
    "ES2022",
    join(consumerRoot, "consumer.ts"),
  ],
  {
    cwd: consumerRoot,
    stdio: "inherit",
  },
);

const installed = JSON.parse(
  readFileSync(
    join(consumerRoot, "node_modules", "@bu-payment", "browser-sdk", "package.json"),
    "utf8",
  ),
);
if (installed.name !== "@bu-payment/browser-sdk" || installed.sideEffects !== false) {
  throw new Error("Installed package metadata is invalid");
}
