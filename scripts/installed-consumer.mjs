import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
execFileSync("npm", ["run", "build"], { cwd: projectRoot, stdio: "inherit" });

const consumerRoot = mkdtempSync(join(tmpdir(), "bu-payment-browser-sdk-consumer-"));
const npmEnvironment = { ...process.env, npm_config_cache: join(consumerRoot, ".npm-cache") };
const packOutput = execFileSync("npm", ["pack", "--json", "--pack-destination", consumerRoot], {
  cwd: projectRoot,
  encoding: "utf8",
  env: npmEnvironment,
});
const [{ filename, files }] = JSON.parse(packOutput);
const publishedPaths = files.map((file) => file.path).sort();
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
execFileSync("npm", ["install", "--ignore-scripts", join(consumerRoot, filename)], {
  cwd: consumerRoot,
  stdio: "inherit",
  env: npmEnvironment,
});

writeFileSync(
  join(consumerRoot, "consumer.mjs"),
  `import { createBuPaymentClient, SessionInvalidError } from "@bu-payment/browser-sdk";
if (typeof createBuPaymentClient !== "function") throw new Error("Missing client export");
if (!(new SessionInvalidError("invalid", { code: "application_session_invalid", status: 401 }) instanceof Error)) throw new Error("Invalid error export");
`,
);
execFileSync(process.execPath, [join(consumerRoot, "consumer.mjs")], {
  cwd: consumerRoot,
  stdio: "inherit",
});

writeFileSync(
  join(consumerRoot, "consumer.ts"),
  `import { createBuPaymentClient, type CheckoutStatus } from "@bu-payment/browser-sdk";
const client = createBuPaymentClient({ publishableKey: "bup_pk_test_sample", apiBaseUrl: "https://api.example.test" });
const status: CheckoutStatus = "completed";
void client.catalogue.listProducts({ limit: 10 });
void status;
`,
);
const typeScript = join(projectRoot, "node_modules", "typescript", "bin", "tsc");
execFileSync(
  process.execPath,
  [
    typeScript,
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
