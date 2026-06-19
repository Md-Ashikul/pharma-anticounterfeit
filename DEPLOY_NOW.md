================================================================================
                    STEP-BY-STEP DEPLOYMENT GUIDE
================================================================================

FOLDER STRUCTURE:
  /vercel/share/v0-project/
    ├─ blockchain/           ← Deploy contracts here
    ├─ backend/              ← Start backend here
    ├─ crypto-service/       ← (no changes needed)
    └─ patient-pwa/          ← (no changes needed)

================================================================================
                      STEP 1: BLOCKCHAIN SETUP
                      Folder: /vercel/share/v0-project/blockchain/
================================================================================

Create file: blockchain/.env

Add these variables:

---BEGIN blockchain/.env---

# DEPLOYER WALLET (Account 1 from MetaMask)
DEPLOYER_PRIVATE_KEY=0xYOUR_ACCOUNT_1_PRIVATE_KEY

# RPC ENDPOINTS
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/your-infura-key
ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc

# GOVERNANCE (2-of-3 voting)
GOVERNANCE_REGULATORS='["0xAccount1Address","0xAccount2Address","0xAccount3Address"]'
GOVERNANCE_THRESHOLD=2

# BLOCK EXPLORER API KEYS (optional, for contract verification)
ETHERSCAN_API_KEY=your_etherscan_key
ARBISCAN_API_KEY=your_arbiscan_key

---END blockchain/.env---

WHERE TO GET THESE VALUES:

  DEPLOYER_PRIVATE_KEY:
    → MetaMask > Account 1 > ⋯ menu > Account Details > Export Private Key
    → Paste it (starts with 0x)

  ARBITRUM_SEPOLIA_RPC_URL:
    → Already filled: https://sepolia-rollup.arbitrum.io/rpc (no key needed)

  GOVERNANCE_REGULATORS:
    → Replace with your 3 government regulator addresses:
    → Account 1 address: MetaMask > Account 1 > Copy address
    → Account 2 address: MetaMask > Account 2 > Copy address
    → Account 3 address: MetaMask > Account 3 > Copy address
    → Format: '["0x111...","0x222...","0x333..."]'

  GOVERNANCE_THRESHOLD:
    → Keep as 2 (means 2-of-3 voting)

================================================================================
                    STEP 2: FUND YOUR ACCOUNT
================================================================================

Your Account 1 needs test ETH on Arbitrum Sepolia:

1. Go to: https://faucet.quicknode.com/arbitrum/sepolia
2. Paste your Account 1 address
3. Request test ETH (0.5 ETH is enough for many deploys)
4. Wait ~1 minute for confirmation

Verify funding:
  → Go to: https://sepolia.arbiscan.io/
  → Search your Account 1 address
  → Should see balance > 0 ETH

================================================================================
                  STEP 3: DEPLOY CONTRACTS
                  Folder: /vercel/share/v0-project/blockchain/
================================================================================

Run command:

  cd blockchain
  npm run deploy:arbitrum

OUTPUT WILL LOOK LIKE:

  Deploying to arbitrumSepolia...
  Deployer balance: 0.5 ETH ✓
  Deploying GovernmentRegistry...
  ✓ GovernmentRegistry deployed at 0x1234...
  ✓ ManufacturerBatch deployed at 0x5678...
  ✓ SupplyChainTracker deployed at 0xabcd...
  
  ✓ Governance initialized: 2-of-3 voting
  ✓ Regulators: 0x111..., 0x222..., 0x333...
  
  COPY THESE TO backend/.env:
  GOVERNMENT_REGISTRY_ADDRESS=0x1234...
  MANUFACTURER_BATCH_ADDRESS=0x5678...
  SUPPLY_CHAIN_TRACKER_ADDRESS=0xabcd...

SAVE THESE ADDRESSES — you'll need them in Step 4.

If error: "Insufficient funds"
  → Not enough ETH. Get more from faucet and try again.

================================================================================
                   STEP 4: BACKEND SETUP
                   Folder: /vercel/share/v0-project/backend/
================================================================================

Create file: backend/.env

Add these variables (update with your values):

---BEGIN backend/.env---

# SERVER
PORT=4000
NODE_ENV=development

# ACTIVE NETWORK
ACTIVE_NETWORK=arbitrum

# RPC (same as blockchain)
RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
ARBITRUM_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc

# CONTRACT ADDRESSES (from Step 3 deploy output)
GOVERNMENT_REGISTRY_ADDRESS=0x1234567890abcdef...
MANUFACTURER_BATCH_ADDRESS=0xfedcba0987654321...
SUPPLY_CHAIN_TRACKER_ADDRESS=0xabcdefabcdefabcd...

# GOVERNMENT ACCOUNTS
GOVERNMENT_PRIVATE_KEY=0xYOUR_ACCOUNT_1_PRIVATE_KEY
GOVERNMENT_REGULATOR_2=0xAccount2Address
GOVERNMENT_REGULATOR_3=0xAccount3Address

# ACTOR ACCOUNTS
MANUFACTURER_ACCOUNT=0xAccount4Address
DISTRIBUTOR_ACCOUNT=0xAccount5Address
RETAILER_ACCOUNT=0xAccount6Address

# IPFS
PINATA_GATEWAY=https://gateway.pinata.cloud/ipfs

# FRONTEND URLs
FRONTEND_URL=http://localhost:3000
PWA_URL=http://localhost:3001

# SIWE
SIWE_DOMAIN=localhost
SIWE_STATEMENT=Sign in to Pharma Anti-Counterfeit System

---END backend/.env---

WHERE TO GET THESE VALUES:

  GOVERNMENT_REGISTRY_ADDRESS, MANUFACTURER_BATCH_ADDRESS, SUPPLY_CHAIN_TRACKER_ADDRESS:
    → From Step 3 deploy output (copy exactly)

  GOVERNMENT_PRIVATE_KEY:
    → Same as blockchain/.env (Account 1 private key)

  GOVERNMENT_REGULATOR_2, GOVERNMENT_REGULATOR_3:
    → MetaMask > Account 2 > Copy address
    → MetaMask > Account 3 > Copy address

  MANUFACTURER_ACCOUNT, DISTRIBUTOR_ACCOUNT, RETAILER_ACCOUNT:
    → MetaMask > Account 4 > Copy address
    → MetaMask > Account 5 > Copy address
    → MetaMask > Account 6 > Copy address

================================================================================
                  STEP 5: START BACKEND
                  Folder: /vercel/share/v0-project/backend/
================================================================================

Run command:

  cd backend
  npm install  (if not already installed)
  npm run dev:l2

OUTPUT SHOULD SHOW:

  Server running on http://localhost:4000
  Connected to Arbitrum Sepolia
  Governance initialized: 2-of-3 voting

If error: "ECONNREFUSED" → RPC is down. Wait and try again.
If error: "Contract not found" → Check addresses in backend/.env

================================================================================
                  STEP 6: VERIFY DEPLOYMENT
                  (In new terminal)
================================================================================

Test governance is working:

  curl -X POST http://localhost:4000/api/government/governance/status

EXPECTED RESPONSE:

  {
    "status": "success",
    "governance": {
      "initialized": true,
      "regulators": ["0x111...", "0x222...", "0x333..."],
      "threshold": 2,
      "regulatorCount": 3
    }
  }

Test proposal creation:

  curl -X POST http://localhost:4000/api/government/entities/propose/register \
    -H "Content-Type: application/json" \
    -d '{
      "wallet": "0xAccount4Address",
      "name": "PharmaCorp",
      "licenseNumber": "LIC-001",
      "role": "manufacturer"
    }'

EXPECTED RESPONSE:

  {
    "status": "success",
    "proposalId": 1,
    "action": "register",
    "status": "pending",
    "votes": 1,
    "threshold": 2
  }

================================================================================
                    TROUBLESHOOTING
================================================================================

Problem: "Insufficient funds"
  Solution: Get more test ETH from faucet

Problem: "Invalid private key"
  Solution: Check DEPLOYER_PRIVATE_KEY starts with 0x and is 66 chars

Problem: "Contract not found at address"
  Solution: Copy addresses exactly from deploy output

Problem: "Connection refused"
  Solution: Wait 1 minute and try again (RPC might be temporarily down)

Problem: "Governance not initialized"
  Solution: Check GOVERNANCE_REGULATORS format: '["0x...","0x...","0x..."]'

Problem: Backend won't start
  Solution: Check backend/.env has all required variables

================================================================================
                      SUMMARY
================================================================================

Files you need to create:
  1. blockchain/.env (14 variables)
  2. backend/.env (20 variables)

Files already updated:
  1. blockchain/package.json ✓
  2. blockchain/scripts/deploy.js ✓
  3. blockchain/contracts/GovernmentRegistry.sol ✓
  4. backend/src/routes/government.js ✓
  5. blockchain/hardhat.config.js ✓
  6. blockchain/deployed-addresses.json ✓

Time to deploy: 15-20 minutes

Next: Follow steps 1-6 in order

================================================================================
