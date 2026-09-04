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
if (typeof client.checkout.present !== "function" || typeof client.checkout.resume !== "function") throw new Error("Missing checkout presentation exports");
if (typeof client.paymentMethods.present !== "function" || typeof client.paymentMethods.resume !== "function") throw new Error("Missing payment method presentation exports");
`,
);
execFileSync("bun", [join(consumerRoot, "consumer.mjs")], {
  cwd: consumerRoot,
  stdio: "inherit",
});

writeFileSync(
  join(consumerRoot, "consumer.ts"),
  `import { createBuPaymentClient, type CheckoutStatus, type PaymentMethodSetup, type PresentationEvent, type PresentationHandle } from "@bu-payment/browser-sdk";
const client = createBuPaymentClient({ publishableKey: "bup_pk_test_sample", apiBaseUrl: "https://api.example.test" });
const status: CheckoutStatus = "completed";
const setup: PaymentMethodSetup = {
  id: "setup",
  status: "requires_action",
  expiresAt: "2030-01-01T00:30:00.000Z",
  presentationVersion: 1,
  presentation: { kind: "redirect", url: "https://vault.example.test" },
  actions: {
    status: { method: "GET", url: "/public/v1/payment-method-setups/setup" },
    confirm: { method: "POST", url: "/public/v1/payment-method-setups/setup/confirm" }
  }
};
const event: PresentationEvent = { type: "polling", flow: "payment_method_resume", status: "processing" };
const handle: PresentationHandle<PaymentMethodSetup> = client.paymentMethods.present(setup, { navigate() {} });
void client.catalogue.listProducts({ limit: 10 });
void client.checkout.resume;
void event;
void handle;
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
