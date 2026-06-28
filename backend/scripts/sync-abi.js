/**
 * sync-abi.js
 * ----------------------------------------------------------------------------
 * Recompiles the Hardhat contracts and copies their freshly-generated ABIs into
 * backend/src/abi/ so the backend stays self-contained (no dependency on the
 * git-ignored blockchain/artifacts folder at runtime).
 *
 * Run this whenever a contract's INTERFACE changes (added/removed/renamed
 * function or event, or changed parameters):
 *     npm run sync-abi      (from the backend folder)
 *
 * A plain redeploy with no interface change does NOT need this — just update the
 * contract address env vars.
 * ----------------------------------------------------------------------------
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const CONTRACTS = ["GovernmentRegistry", "ManufacturerBatch", "SupplyChainTracker"];

const BACKEND_DIR = path.resolve(__dirname, "..");
const BLOCKCHAIN_DIR = path.resolve(BACKEND_DIR, "../blockchain");
const ARTIFACTS_DIR = path.join(BLOCKCHAIN_DIR, "artifacts/contracts");
const OUT_DIR = path.join(BACKEND_DIR, "src/abi");

function main() {
  if (!fs.existsSync(BLOCKCHAIN_DIR)) {
    console.error(`[sync-abi] blockchain folder not found at ${BLOCKCHAIN_DIR}`);
    console.error("[sync-abi] Run this from a full checkout that includes /blockchain.");
    process.exit(1);
  }

  console.log("[sync-abi] Compiling contracts...");
  execSync("npx hardhat compile", { cwd: BLOCKCHAIN_DIR, stdio: "inherit" });

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const name of CONTRACTS) {
    const artifactPath = path.join(ARTIFACTS_DIR, `${name}.sol`, `${name}.json`);
    if (!fs.existsSync(artifactPath)) {
      console.error(`[sync-abi] Artifact missing: ${artifactPath}`);
      process.exit(1);
    }
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    const outPath = path.join(OUT_DIR, `${name}.json`);
    fs.writeFileSync(outPath, JSON.stringify(artifact.abi, null, 2) + "\n");
    console.log(`[sync-abi] ${name}: ${artifact.abi.length} entries -> src/abi/${name}.json`);
  }

  console.log("[sync-abi] Done. Commit the updated src/abi/*.json files.");
}

main();
