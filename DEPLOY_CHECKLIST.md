# Arbitrum Deployment Checklist

## Pre-Deployment

- [ ] **1. Fund your deployer wallet**
  - Use your existing MetaMask Account 1 (the one that was the deployer before)
  - Get test ETH from [Arbitrum Sepolia Faucet](https://faucet.quicknode.com/arbitrum/sepolia) (~0.5 ETH)
  - Verify balance on [Arbiscan Testnet](https://sepolia.arbiscan.io/)

- [ ] **2. Set environment variables** in `blockchain/.env`
  ```bash
  DEPLOYER_PRIVATE_KEY=<your_existing_private_key_from_metamask>
  ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
  
  # Governance (optional — if omitted, single-regulator mode)
  GOVERNANCE_REGULATORS='["0x111...","0x222...","0x333..."]'
  GOVERNANCE_THRESHOLD=2
  ```

- [ ] **3. Verify blockchain dependencies installed**
  ```bash
  cd blockchain
  npm ci
  npx hardhat compile --quiet
  ```

## Deployment

- [ ] **4. Deploy to Arbitrum Sepolia**
  ```bash
  cd blockchain
  npm run deploy:arbitrum
  ```
  
  Expected output:
  ```
  ✓ GovernmentRegistry deployed to: 0x...
  ✓ ManufacturerBatch deployed to: 0x...
  ✓ SupplyChainTracker deployed to: 0x...
  ✓ Governance initialized: 1-of-1 (or M-of-N if you set env vars)
  ✓ Addresses saved to deployed-addresses.json
  ```

- [ ] **5. Copy contract addresses from deploy output**
  - Save: `GovernmentRegistry`, `ManufacturerBatch`, `SupplyChainTracker`
  - Format: `0x...` (42 chars including `0x`)

## Post-Deployment Setup

- [ ] **6. Update `backend/.env`**
  ```bash
  ACTIVE_NETWORK=arbitrum
  ARBITRUM_GOVERNMENT_REGISTRY_ADDRESS=0x...
  ARBITRUM_MANUFACTURER_BATCH_ADDRESS=0x...
  ARBITRUM_SUPPLY_CHAIN_TRACKER_ADDRESS=0x...
  ARBITRUM_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
  ```

- [ ] **7. Restart backend**
  ```bash
  cd backend
  npm run dev
  ```
  Backend will auto-detect `ACTIVE_NETWORK=arbitrum` and use the `ARBITRUM_*` addresses

- [ ] **8. (Optional) Verify contracts on Arbiscan**
  Use the `hardhat verify` commands from deploy output:
  ```bash
  npx hardhat verify --network arbitrumSepolia <ADDRESS> <CONSTRUCTOR_ARG>
  ```
  This makes the code public on Arbiscan for transparency.

## Testing

- [ ] **9. Test the voting system (optional)**
  ```bash
  cd blockchain
  npx hardhat run scripts/test-governance.js --network arbitrumSepolia
  ```
  
  Expected: Full governance flow with proposal creation, voting, and auto-execution.

- [ ] **10. Test the backend API**
  ```bash
  # Check governance status
  curl http://localhost:4000/api/government/governance/status
  
  # Should return: initialized, regulators, threshold
  ```

- [ ] **11. Test the consumer flow**
  - Open PWA at `http://localhost:3001`
  - Generate a batch on Arbitrum (or use old Sepolia batches to test cross-network)
  - Scan a QR code and verify it works

## Verification

- [ ] **12. Cross-check addresses**
  - Open [Arbiscan Sepolia](https://sepolia.arbiscan.io/)
  - Paste each contract address
  - Verify: Contract code visible, functions match the interface

- [ ] **13. Check governance initialized**
  - On Arbiscan, call `getRegulators()` on GovernmentRegistry
  - Should return your regulator addresses + threshold

- [ ] **14. Verify on deployed-addresses.json**
  ```json
  {
    "arbitrumSepolia": {
      "GovernmentRegistry": "0x...",
      "ManufacturerBatch": "0x...",
      "SupplyChainTracker": "0x...",
      "governance": {
        "regulators": ["0x..."],
        "threshold": 1,
        "initialized": true
      }
    },
    "sepolia": {
      // Old Sepolia addresses (preserved)
    }
  }
  ```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Deployer wallet has 0 ETH" | Fund from Arbitrum Sepolia faucet |
| "Invalid RPC URL" | Check `ARBITRUM_SEPOLIA_RPC_URL` env var |
| "Account nonce too high" | Reset nonce (advanced) or use a new wallet |
| Backend still uses Sepolia | Check `ACTIVE_NETWORK=arbitrum` in backend/.env |
| Governance initialization fails | Verify `GOVERNANCE_REGULATORS` is valid JSON |
| Test script hangs | Increase timeout or check faucet for stuck tx |

## Ready for Production?

Once satisfied with Arbitrum Sepolia testing:

1. **Deploy to Arbitrum mainnet**
   - Update `ARBITRUM_SEPOLIA_RPC_URL` → `ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc`
   - Fund deployer wallet with mainnet ETH
   - Re-run deploy script

2. **Add real regulatory addresses**
   - Replace `GOVERNANCE_REGULATORS` with actual regulator wallet addresses
   - Update `GOVERNANCE_THRESHOLD` to your chosen M-of-N

3. **Enable SIWE authentication**
   - Update `SIWE_DOMAIN`, `SIWE_STATEMENT` for your domain
   - Deploy frontend/PWA to production

4. **Monitor governance votes**
   - Listen to blockchain events (ProposalCreated, ProposalVoted, ProposalExecuted)
   - Index with The Graph or Covalent for full proposal history

---

**Timeline**: ~30 min to deploy, ~1 hour to test end-to-end, ready for production.
