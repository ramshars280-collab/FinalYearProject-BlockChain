/**
 * SOET VeriTrust – Priority 6B Staging Preflight Verification Tool
 *
 * Performs non-destructive, read-only operational checks across:
 * 1. Application Configuration & Secret Entropy Validation
 * 2. Remote Turso / libSQL Database Connectivity & Schema Inspection
 * 3. Ethereum Sepolia JSON-RPC & Smart Contract Bytecode Verification
 * 4. Hugging Face Spaces / Python AI Forensic Microservice Health Diagnostics
 * 5. Vercel Serverless & Build Invariant Verification
 *
 * Invariants Enforced:
 * - Strictly read-only queries (SELECT, eth_call, eth_getCode, GET /health).
 * - Zero database mutations (NO INSERT, UPDATE, DELETE, DROP, ALTER).
 * - Zero blockchain transactions (NO eth_sendRawTransaction).
 * - Zero secrets or tokens logged to console output.
 */

import { ethers } from "ethers";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// Load environment configuration (.env.local or .env if present)
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

interface CheckResult {
  category: string;
  name: string;
  status: "PASS" | "WARN" | "FAIL" | "INFO";
  details: string;
}

const results: CheckResult[] = [];

function recordCheck(
  category: string,
  name: string,
  status: "PASS" | "WARN" | "FAIL" | "INFO",
  details: string
) {
  results.push({ category, name, status, details });
  const icon =
    status === "PASS"
      ? "✅ [PASS]"
      : status === "WARN"
      ? "⚠️  [WARN]"
      : status === "INFO"
      ? "ℹ️  [INFO]"
      : "❌ [FAIL]";
  console.log(`${icon} [${category}] ${name}: ${details}`);
}

async function runStagingPreflight() {
  console.log("================================================================================");
  console.log("  SOET VeriTrust – Priority 6B Staging Preflight Verification");
  console.log("  Timestamp:", new Date().toISOString());
  console.log("  Operating Mode: STRICTLY READ-ONLY (Zero Side-Effects)");
  console.log("================================================================================\n");

  const isProduction = process.env.NODE_ENV === "production";
  const isStrict = process.argv.includes("--strict");

  // ===========================================================================
  // SECTION 1: ENVIRONMENT CONFIGURATION & SECRET ENTROPY AUDIT
  // ===========================================================================
  console.log("--- Section 1: Environment & Secret Configuration Audit ---");

  // 1.1 Node Environment
  recordCheck(
    "CONFIG",
    "NODE_ENV Setting",
    "INFO",
    `Current NODE_ENV='${process.env.NODE_ENV || "development"}'`
  );

  // 1.2 Session Auth Secret
  const authSecret = process.env.AUTH_SECRET?.trim();
  if (!authSecret) {
    if (isProduction || isStrict) {
      recordCheck(
        "CONFIG",
        "AUTH_SECRET",
        "FAIL",
        "Missing AUTH_SECRET. Production mode requires a minimum 32-character secret."
      );
    } else {
      recordCheck(
        "CONFIG",
        "AUTH_SECRET",
        "WARN",
        "AUTH_SECRET is unset in current environment (required before Vercel deployment)."
      );
    }
  } else if (authSecret.length < 32) {
    recordCheck(
      "CONFIG",
      "AUTH_SECRET",
      "FAIL",
      `AUTH_SECRET length (${authSecret.length}) is below the required 32-character threshold.`
    );
  } else if (
    authSecret.includes("REPLACE_WITH_") ||
    authSecret === "default_dev_secret_veritrust_super_secure_32chars"
  ) {
    recordCheck(
      "CONFIG",
      "AUTH_SECRET",
      "FAIL",
      "AUTH_SECRET uses a known default or template placeholder."
    );
  } else {
    recordCheck(
      "CONFIG",
      "AUTH_SECRET",
      "PASS",
      `High-entropy secret configured (${authSecret.length} chars, masked).`
    );
  }

  // 1.3 Admin Password
  const adminPassword = process.env.ADMIN_PASSWORD?.trim();
  if (!adminPassword) {
    recordCheck(
      "CONFIG",
      "ADMIN_PASSWORD",
      isProduction || isStrict ? "FAIL" : "WARN",
      "ADMIN_PASSWORD is unset in current environment (required for institutional portal)."
    );
  } else if (adminPassword === "admin123" || adminPassword.includes("REPLACE_WITH_")) {
    recordCheck(
      "CONFIG",
      "ADMIN_PASSWORD",
      "FAIL",
      "ADMIN_PASSWORD uses default 'admin123' or template placeholder."
    );
  } else {
    recordCheck(
      "CONFIG",
      "ADMIN_PASSWORD",
      "PASS",
      `Strong admin passphrase configured (${adminPassword.length} chars, masked).`
    );
  }

  // 1.4 Application URL
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim();
  if (!appUrl) {
    recordCheck(
      "CONFIG",
      "NEXT_PUBLIC_APP_URL",
      "WARN",
      "NEXT_PUBLIC_APP_URL unset. Will default to request origin in local dev, but canonical URL required for staging QR codes."
    );
  } else {
    try {
      const parsed = new URL(appUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        recordCheck(
          "CONFIG",
          "NEXT_PUBLIC_APP_URL",
          "FAIL",
          `Invalid protocol '${parsed.protocol}'. Expected http: or https:.`
        );
      } else {
        recordCheck(
          "CONFIG",
          "NEXT_PUBLIC_APP_URL",
          "PASS",
          `Canonical origin valid: '${parsed.origin}'`
        );
      }
    } catch {
      recordCheck(
        "CONFIG",
        "NEXT_PUBLIC_APP_URL",
        "FAIL",
        `Malformed URL: '${appUrl}'`
      );
    }
  }

  // 1.5 Auto-Seeding Policy
  const autoSeed = process.env.ALLOW_AUTO_SEED;
  if (autoSeed === "true" && isProduction) {
    recordCheck(
      "CONFIG",
      "ALLOW_AUTO_SEED",
      "FAIL",
      "ALLOW_AUTO_SEED must remain 'false' in production to prevent masking unmounted storage."
    );
  } else {
    recordCheck(
      "CONFIG",
      "ALLOW_AUTO_SEED",
      "PASS",
      `Auto-seed is safely disabled (${autoSeed || "unset -> false"}).`
    );
  }

  // 1.6 Forensic Secret
  const forensicSecret = process.env.AI_FORENSIC_SECRET?.trim();
  if (!forensicSecret) {
    recordCheck(
      "CONFIG",
      "AI_FORENSIC_SECRET",
      "WARN",
      "AI_FORENSIC_SECRET is unset. FastAPI microservice will run in open/unauthenticated mode."
    );
  } else {
    recordCheck(
      "CONFIG",
      "AI_FORENSIC_SECRET",
      "PASS",
      `Shared microservice secret configured (${forensicSecret.length} chars, masked).`
    );
  }

  // ===========================================================================
  // SECTION 2: TURSO REMOTE DATABASE READINESS & SCHEMA AUDIT
  // ===========================================================================
  console.log("\n--- Section 2: Remote Turso / libSQL Database Audit ---");

  const tursoUrl = process.env.TURSO_DATABASE_URL?.trim();
  const tursoToken = process.env.TURSO_AUTH_TOKEN?.trim();

  if (!tursoUrl || !tursoToken) {
    recordCheck(
      "DATABASE",
      "Turso Configuration Status",
      "INFO",
      "TURSO_DATABASE_URL / TURSO_AUTH_TOKEN not provided in current environment. Local SQLite is active."
    );
    recordCheck(
      "DATABASE",
      "Serverless Readiness",
      isProduction ? "FAIL" : "WARN",
      "Vercel staging requires Turso credentials. Run 'turso db create veritrust-staging' to provision."
    );
  } else {
    try {
      const { createClient } = require("@libsql/client");
      const startTime = Date.now();
      const client = createClient({
        url: tursoUrl,
        authToken: tursoToken,
      });

      // Non-destructive read-only probe
      const pingRes = await client.execute("SELECT 1 AS alive;");
      const latencyMs = Date.now() - startTime;

      if (pingRes && pingRes.rows && pingRes.rows.length > 0) {
        recordCheck(
          "DATABASE",
          "Turso Remote Ping",
          "PASS",
          `Connected to Turso successfully in ${latencyMs}ms (Protocol: ${tursoUrl.split("://")[0]}).`
        );

        // Inspect existing schema tables
        const tablesRes = await client.execute(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_libsql%';"
        );
        const existingTables = (tablesRes.rows || []).map((r: any) => String(r.name));

        const requiredTables = ["batches", "revocations", "credentials", "student_accounts"];
        const missingTables = requiredTables.filter((t) => !existingTables.includes(t));

        if (missingTables.length === 0) {
          // Count rows safely
          const batchCount = (await client.execute("SELECT COUNT(*) AS c FROM batches;")).rows[0].c;
          const credCount = (await client.execute("SELECT COUNT(*) AS c FROM credentials;")).rows[0].c;
          const accCount = (await client.execute("SELECT COUNT(*) AS c FROM student_accounts;")).rows[0].c;

          recordCheck(
            "DATABASE",
            "Turso Schema Verification",
            "PASS",
            `All ${requiredTables.length} required tables exist (batches: ${batchCount}, credentials: ${credCount}, student_accounts: ${accCount}).`
          );
        } else {
          recordCheck(
            "DATABASE",
            "Turso Schema Verification",
            "WARN",
            `Database is reachable but missing tables: [${missingTables.join(", ")}]. Application will initialize schema automatically upon first boot.`
          );
        }
      }
    } catch (err: any) {
      recordCheck(
        "DATABASE",
        "Turso Remote Connectivity",
        "FAIL",
        `Failed to connect to Turso remote database: ${err.message}`
      );
    }
  }

  // ===========================================================================
  // SECTION 3: ETHEREUM SEPOLIA BLOCKCHAIN & CONTRACT BYTECODE AUDIT
  // ===========================================================================
  console.log("\n--- Section 3: Ethereum Sepolia Smart Contract Audit ---");

  const primaryRpc =
    process.env.NEXT_PUBLIC_SEPOLIA_RPC?.trim() ||
    process.env.SEPOLIA_RPC_URL?.trim() ||
    "https://ethereum-sepolia-rpc.publicnode.com";

  const fallbackRpc = "https://ethereum-sepolia-rpc.publicnode.com";

  const credentialRegistryAddress =
    process.env.NEXT_PUBLIC_CREDENTIAL_REGISTRY?.trim() ||
    "0xe7Cc39AF2ACC1dd637C863aB5DB18aC904b76Bc4";

  const identityRegistryAddress =
    process.env.NEXT_PUBLIC_IDENTITY_REGISTRY?.trim() ||
    "0xa8e6B6bAEa48F78eBFeE5967B9836779691c0971";

  // 3.1 Primary Sepolia RPC Verification
  let provider: ethers.JsonRpcProvider | null = null;
  try {
    const sanitizedRpcDisplay = primaryRpc.replace(/\/v2\/[a-zA-Z0-9_-]+/, "/v2/[REDACTED_API_KEY]");
    console.log(`Connecting to primary Sepolia RPC: ${sanitizedRpcDisplay}...`);

    provider = new ethers.JsonRpcProvider(primaryRpc);
    const network = await provider.getNetwork();
    const chainId = Number(network.chainId);

    if (chainId === 11155111) {
      recordCheck(
        "BLOCKCHAIN",
        "Sepolia Chain ID",
        "PASS",
        `Verified chain ID 11155111 (0xaa36a7) via ${sanitizedRpcDisplay}.`
      );
    } else {
      recordCheck(
        "BLOCKCHAIN",
        "Sepolia Chain ID",
        "FAIL",
        `Unexpected chain ID: ${chainId}. Expected 11155111.`
      );
    }

    const blockNum = await provider.getBlockNumber();
    recordCheck(
      "BLOCKCHAIN",
      "Sepolia Block Height",
      "PASS",
      `Latest block height on Sepolia: #${blockNum}`
    );
  } catch (rpcErr: any) {
    recordCheck(
      "BLOCKCHAIN",
      "Primary Sepolia RPC",
      "WARN",
      `Primary RPC failed: ${rpcErr.message}. Testing public fallback...`
    );

    try {
      provider = new ethers.JsonRpcProvider(fallbackRpc);
      const network = await provider.getNetwork();
      if (Number(network.chainId) === 11155111) {
        recordCheck(
          "BLOCKCHAIN",
          "PublicNode Sepolia Fallback",
          "PASS",
          `Fallback RPC ${fallbackRpc} verified chain ID 11155111.`
        );
      }
    } catch (fallbackErr: any) {
      recordCheck(
        "BLOCKCHAIN",
        "Sepolia RPC Connectivity",
        "FAIL",
        `Both primary and fallback RPC failed: ${fallbackErr.message}`
      );
    }
  }

  // 3.2 Smart Contract Bytecode & Owner Verification
  if (provider) {
    try {
      // CredentialRegistry
      const credCode = await provider.getCode(credentialRegistryAddress);
      if (credCode && credCode !== "0x" && credCode.length > 100) {
        recordCheck(
          "BLOCKCHAIN",
          "CredentialRegistry Contract Bytecode",
          "PASS",
          `Deployed at ${credentialRegistryAddress} (Bytecode size: ${credCode.length / 2 - 1} bytes).`
        );

        // Read contract owner
        try {
          const ownerData = await provider.call({
            to: credentialRegistryAddress,
            data: "0x8da5cb5b", // owner()
          });
          if (ownerData && ownerData.length >= 66) {
            const owner = ethers.getAddress("0x" + ownerData.slice(26));
            recordCheck(
              "BLOCKCHAIN",
              "CredentialRegistry Contract Owner",
              "PASS",
              `Active owner address: ${owner}`
            );
          }
        } catch {
          recordCheck(
            "BLOCKCHAIN",
            "CredentialRegistry Contract Owner",
            "INFO",
            "Unable to resolve owner() view function (non-fatal)."
          );
        }
      } else {
        recordCheck(
          "BLOCKCHAIN",
          "CredentialRegistry Contract Bytecode",
          "FAIL",
          `No contract bytecode found at ${credentialRegistryAddress} on Sepolia.`
        );
      }

      // IdentityRegistry
      const idCode = await provider.getCode(identityRegistryAddress);
      if (idCode && idCode !== "0x" && idCode.length > 100) {
        recordCheck(
          "BLOCKCHAIN",
          "IdentityRegistry Contract Bytecode",
          "PASS",
          `Deployed at ${identityRegistryAddress} (Bytecode size: ${idCode.length / 2 - 1} bytes).`
        );
      } else {
        recordCheck(
          "BLOCKCHAIN",
          "IdentityRegistry Contract Bytecode",
          "FAIL",
          `No contract bytecode found at ${identityRegistryAddress} on Sepolia.`
        );
      }
    } catch (contractErr: any) {
      recordCheck(
        "BLOCKCHAIN",
        "Contract Verification",
        "FAIL",
        `Contract bytecode check failed: ${contractErr.message}`
      );
    }
  }

  // ===========================================================================
  // SECTION 4: HUGGING FACE / PYTHON AI FORENSIC MICROSERVICE HEALTH
  // ===========================================================================
  console.log("\n--- Section 4: AI Forensic Microservice Health Diagnostics ---");

  const aiServiceUrl =
    process.env.AI_FORENSIC_SERVICE_URL?.trim() || "http://127.0.0.1:8000";

  const sanitizedAiUrl = aiServiceUrl.replace(/\/+$/, "");
  const healthEndpoint = `${sanitizedAiUrl}/health`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const healthHeaders: Record<string, string> = {};
    if (forensicSecret) {
      healthHeaders["X-Forensic-Secret"] = forensicSecret;
    }

    const healthRes = await fetch(healthEndpoint, {
      method: "GET",
      headers: healthHeaders,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (healthRes.ok) {
      const data = await healthRes.json();
      recordCheck(
        "AI_FORENSIC",
        "Microservice Health Endpoint",
        "PASS",
        `Online at ${healthEndpoint} (Status: ${data.status}, Engine: ${data.engine}, Device: ${data.device}, Mode: ${data.mode || "standard"}).`
      );
    } else {
      recordCheck(
        "AI_FORENSIC",
        "Microservice Health Endpoint",
        "WARN",
        `Microservice returned HTTP ${healthRes.status} at ${healthEndpoint}.`
      );
    }
  } catch (aiErr: any) {
    const isLocalhost = sanitizedAiUrl.includes("127.0.0.1") || sanitizedAiUrl.includes("localhost");
    recordCheck(
      "AI_FORENSIC",
      "Microservice Health Endpoint",
      "INFO",
      `Microservice not responding at ${healthEndpoint} (${aiErr.message}). ` +
        (isLocalhost
          ? "Start locally via 'npm run start:ai' or deploy to Hugging Face Spaces for staging."
          : "Verify Hugging Face Spaces container status.")
    );
  }

  // ===========================================================================
  // SECTION 5: VERCEL SERVERLESS & BUILD COMPATIBILITY AUDIT
  // ===========================================================================
  console.log("\n--- Section 5: Vercel Serverless & Build Invariant Audit ---");

  // 5.1 vercel.json existence
  const vercelJsonPath = path.resolve(process.cwd(), "vercel.json");
  if (fs.existsSync(vercelJsonPath)) {
    try {
      const vercelJson = JSON.parse(fs.readFileSync(vercelJsonPath, "utf-8"));
      recordCheck(
        "VERCEL",
        "vercel.json Manifest",
        "PASS",
        `Detected vercel.json (framework: '${vercelJson.framework || "unspecified"}').`
      );
    } catch (err: any) {
      recordCheck("VERCEL", "vercel.json Manifest", "FAIL", `Malformed vercel.json: ${err.message}`);
    }
  } else {
    recordCheck(
      "VERCEL",
      "vercel.json Manifest",
      "INFO",
      "vercel.json not present. Vercel automatically uses Next.js zero-config defaults."
    );
  }

  // 5.2 next.config.js Vercel distDir handling
  const nextConfigPath = path.resolve(process.cwd(), "next.config.js");
  if (fs.existsSync(nextConfigPath)) {
    const nextConfigContent = fs.readFileSync(nextConfigPath, "utf-8");
    if (nextConfigContent.includes("isVercel") || nextConfigContent.includes("process.env.VERCEL")) {
      recordCheck(
        "VERCEL",
        "Next.js distDir Vercel Guard",
        "PASS",
        "next.config.js properly routes Vercel builds to '.next' while isolating local builds."
      );
    } else {
      recordCheck(
        "VERCEL",
        "Next.js distDir Vercel Guard",
        "WARN",
        "next.config.js may output to '.next_prod' on Vercel unless VERCEL env is handled."
      );
    }
  }

  // 5.3 Hugging Face Dockerfile port
  const dockerfilePath = path.resolve(process.cwd(), "forgery_service", "Dockerfile");
  if (fs.existsSync(dockerfilePath)) {
    const dockerfileContent = fs.readFileSync(dockerfilePath, "utf-8");
    if (dockerfileContent.includes("7860")) {
      recordCheck(
        "DOCKER",
        "Hugging Face Spaces Port Compatibility",
        "PASS",
        "forgery_service/Dockerfile exposes and binds to port 7860 (Hugging Face standard)."
      );
    } else {
      recordCheck(
        "DOCKER",
        "Hugging Face Spaces Port Compatibility",
        "WARN",
        "Dockerfile does not reference port 7860. Hugging Face Spaces may require PORT=7860."
      );
    }
  }

  // ===========================================================================
  // SUMMARY & EXIT CLASSIFICATION
  // ===========================================================================
  console.log("\n================================================================================");
  console.log("  PREFLIGHT AUDIT SUMMARY");
  console.log("================================================================================");

  const passes = results.filter((r) => r.status === "PASS").length;
  const warns = results.filter((r) => r.status === "WARN").length;
  const infos = results.filter((r) => r.status === "INFO").length;
  const fails = results.filter((r) => r.status === "FAIL").length;

  console.log(`Total Checks: ${results.length}`);
  console.log(`  ✅ Passed:   ${passes}`);
  console.log(`  ⚠️  Warnings: ${warns}`);
  console.log(`  ℹ️  Info:     ${infos}`);
  console.log(`  ❌ Failed:   ${fails}`);

  if (fails > 0) {
    console.error("\n❌ PREFLIGHT VERDICT: FAILED (Critical misconfigurations detected)");
    process.exit(1);
  } else if (warns > 0) {
    console.log("\n⚠️  PREFLIGHT VERDICT: READY WITH CONDITIONS (External staging resources pending)");
    process.exit(0);
  } else {
    console.log("\n✅ PREFLIGHT VERDICT: FULLY READY FOR STAGING DEPLOYMENT");
    process.exit(0);
  }
}

// Execute preflight
runStagingPreflight().catch((err) => {
  console.error("Fatal preflight execution error:", err);
  process.exit(1);
});

