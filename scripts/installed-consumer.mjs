import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
execFileSync("bun", ["run", "build"], { cwd: projectRoot, stdio: "inherit" });

const consumerRoot = mkdtempSync(join(tmpdir(), "bu-payment-browser-sdk-consumer-"));
const archivePath = join(consumerRoot, "bu-payment-browser-sdk.tgz");
const bunEnvironment = { ...process.env, BUN_INSTALL_CACHE_DIR: join(consumerRoot, ".bun-cache") };
execFileSync("bun", ["pm", "pack", "--filename", archivePath, "--quiet"], {
  cwd: projectRoot,
  stdio: "inherit",
  env: bunEnvironment,
});

const publishedPaths = execFileSync("tar", ["-tzf", archivePath], { encoding: "utf8" })
  .trim()
  .split("\n")
  .map((path) => path.replace(/^package\//, ""));
for (const required of [
  "README.md",
  "dist/index.js",
  "dist/index.d.ts",
  "dist/types.d.ts",
  "docs/operations-and-events.md",
  "package.json",
]) {
  if (!publishedPaths.includes(required)) throw new Error(`Missing package file: ${required}`);
}
if (
  publishedPaths.some(
    (path) => path.includes("superpowers") || path.includes("presentation-and-events"),
  )
) {
  throw new Error("Package contains private planning or removed documentation");
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
  `import { BuPaymentError, createBuPaymentClient, ErrorCode, OperationKind } from "@bu-payment/browser-sdk";
const runtime = await import("@bu-payment/browser-sdk");
const expected = ["BuPaymentError", "ErrorCode", "OperationKind", "createBuPaymentClient"];
if (JSON.stringify(Object.keys(runtime).sort()) !== JSON.stringify(expected)) throw new Error("Unexpected root exports");
if (OperationKind.CHECKOUT !== "checkout" || ErrorCode.OPERATION_CANCELLED !== "operation_cancelled") throw new Error("Missing runtime constants");
if (!(new BuPaymentError("cancelled", { code: ErrorCode.OPERATION_CANCELLED }) instanceof Error)) throw new Error("Invalid public error");
const client = createBuPaymentClient({ publishableKey: "bup_pk_test_sample", apiBaseUrl: "https://api.example.test", fetch: async () => Response.json({}) });
if (typeof client.checkout.open !== "function" || typeof client.checkout.status !== "function") throw new Error("Missing checkout operations");
if ("presentation" in client.checkout || "resume" in client.checkout || "idempotencyKey" in client.checkout) throw new Error("Legacy checkout API exported");
if ("resume" in client.cardSaving || typeof client.cardSaving.email !== "function") throw new Error("Legacy card-saving API exported");
if (typeof client.operations.resume !== "function" || client.operations.resume() !== undefined) throw new Error("Invalid operation resume API");
const ready = client.checkout.priceId("price").email("buyer@example.com").quantity(1).destinationKey("default");
if (!Object.isFrozen(client.checkout) || !Object.isFrozen(ready) || typeof ready.start !== "function" || typeof ready.create !== "function") throw new Error("Checkout builder is not immutable");
`,
);
execFileSync("bun", [join(consumerRoot, "consumer.mjs")], { cwd: consumerRoot, stdio: "inherit" });

writeFileSync(
  join(consumerRoot, "consumer.ts"),
  `import { createBuPaymentClient, ErrorCode, OperationKind } from "@bu-payment/browser-sdk";
import type { BuPaymentClient, CataloguePage, Checkout, CheckoutResult, ErrorCode as ErrorCodeValue, OperationEvent, OperationHandle, PaymentMethodSetup, Price, Product } from "@bu-payment/browser-sdk/types";
const client: BuPaymentClient = createBuPaymentClient({ publishableKey: "bup_pk_test_sample", apiBaseUrl: "https://api.example.test" });
const event: OperationEvent = { type: "opening", kind: OperationKind.CHECKOUT };
const code: ErrorCodeValue = ErrorCode.CONFIGURATION_INVALID;
const resumed: OperationHandle<CheckoutResult | PaymentMethodSetup> | undefined = client.operations.resume();
const checkout: Promise<Checkout> = client.checkout.priceId("price").email("buyer@example.com").quantity(1).destinationKey("default").create();
const started: OperationHandle<CheckoutResult> = client.checkout.priceId("price").email("buyer@example.com").quantity(1).destinationKey("default").start();
const page = {} as CataloguePage<Product | Price>;
// @ts-expect-error public types are absent from the runtime root.
type RemovedRootType = import("@bu-payment/browser-sdk").BuPaymentClient;
// @ts-expect-error specialized errors are removed.
type RemovedError = import("@bu-payment/browser-sdk").SessionInvalidError;
// @ts-expect-error start requires all checkout inputs.
client.checkout.start();
void event; void code; void resumed; void checkout; void started; void page;
`,
);

for (const moduleResolution of ["NodeNext", "Bundler"]) {
  const module = moduleResolution === "NodeNext" ? "NodeNext" : "ESNext";
  execFileSync(
    "bun",
    [
      "x",
      "tsc",
      "--noEmit",
      "--strict",
      "--skipLibCheck",
      "--module",
      module,
      "--moduleResolution",
      moduleResolution,
      "--target",
      "ES2022",
      join(consumerRoot, "consumer.ts"),
    ],
    { cwd: consumerRoot, stdio: "inherit" },
  );
}

const installed = JSON.parse(
  readFileSync(
    join(consumerRoot, "node_modules", "@bu-payment", "browser-sdk", "package.json"),
    "utf8",
  ),
);
if (installed.name !== "@bu-payment/browser-sdk" || installed.sideEffects !== false) {
  throw new Error("Installed package metadata is invalid");
}
