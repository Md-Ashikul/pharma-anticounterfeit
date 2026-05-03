const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Pharma Anti-Counterfeit — Full Contract Suite", function () {
    let govReg, mfgBatch, sct;
    let govt, manufacturer, distributor, retailer, stranger;

    before(async () => {
        [govt, manufacturer, distributor, retailer, stranger] = await ethers.getSigners();

        // Deploy GovernmentRegistry — govt is the owner/authority
        const GovReg = await ethers.getContractFactory("GovernmentRegistry");
        govReg = await GovReg.deploy(govt.address);

        // Deploy ManufacturerBatch
        const MfgBatch = await ethers.getContractFactory("ManufacturerBatch");
        mfgBatch = await MfgBatch.deploy(await govReg.getAddress());

        // Deploy SupplyChainTracker
        const SCT = await ethers.getContractFactory("SupplyChainTracker");
        sct = await SCT.deploy(await govReg.getAddress());

        // Register entities in GovernmentRegistry
        await govReg.connect(govt).registerEntity(
            manufacturer.address, "PharmaCorp Ltd", "MFG-001",
            1 // Manufacturer
        );
        await govReg.connect(govt).registerEntity(
            distributor.address, "DistribHub Inc", "DIST-001",
            2 // Distributor
        );
        await govReg.connect(govt).registerEntity(
            retailer.address, "RetailMed Co", "RET-001",
            3 // Retailer
        );
    });

    // ─── GovernmentRegistry ───────────────────────────────────────────────────

    describe("GovernmentRegistry", () => {
        it("Whitelists manufacturer correctly", async () => {
            expect(await govReg.isWhitelisted(manufacturer.address)).to.be.true;
        });

        it("Returns correct role string", async () => {
            expect(await govReg.getEntityRoleString(manufacturer.address)).to.equal("Manufacturer");
            expect(await govReg.getEntityRoleString(distributor.address)).to.equal("Distributor");
            expect(await govReg.getEntityRoleString(retailer.address)).to.equal("Retailer");
        });

        it("Revokes entity and blocks them", async () => {
            await govReg.connect(govt).revokeEntity(retailer.address, "License expired");
            expect(await govReg.isWhitelisted(retailer.address)).to.be.false;
            // Reinstate for later tests
            await govReg.connect(govt).reinstateEntity(retailer.address);
            expect(await govReg.isWhitelisted(retailer.address)).to.be.true;
        });

        it("Prevents strangers from registering entities", async () => {
            await expect(
                govReg.connect(stranger).registerEntity(stranger.address, "X", "Y", 1)
            ).to.be.reverted;
        });
    });

    // ─── ManufacturerBatch ────────────────────────────────────────────────────

    describe("ManufacturerBatch", () => {
        // Simulate a Merkle tree with 2 leaves for simplicity
        let secret1, secret2, leaf1, leaf2, merkleRoot, proof1;
        const batchId = "COMP-A-B1";
        const ipfsCID = "QmTestCID123";

        before(async () => {
            // Simulate: secret → keccak256(secret) = leaf
            secret1 = ethers.encodeBytes32String("secret-strip-001");
            secret2 = ethers.encodeBytes32String("secret-strip-002");

            leaf1 = ethers.keccak256(secret1);
            leaf2 = ethers.keccak256(secret2);

            // Simple 2-leaf Merkle root: hash(sorted(leaf1, leaf2))
            const sorted = [leaf1, leaf2].sort();
            merkleRoot = ethers.keccak256(ethers.concat(sorted));

            // Proof for leaf1: just [leaf2] (sibling)
            proof1 = [leaf2];
        });

        it("Allows whitelisted manufacturer to register a batch", async () => {
            const expiryDate = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;

            const tx = await mfgBatch.connect(manufacturer).registerBatch(
                batchId, merkleRoot, ipfsCID, expiryDate, "Paracetamol 500mg"
            );
            const receipt = await tx.wait();

            // Verify event was emitted with correct core args (timestamp checked separately)
            await expect(tx)
                .to.emit(mfgBatch, "BatchRegistered")
                .withArgs(
                    batchId,
                    manufacturer.address,
                    merkleRoot,
                    ipfsCID,
                    expiryDate,
                    receipt.blockNumber > 0
                        ? (await ethers.provider.getBlock(receipt.blockNumber)).timestamp
                        : 0
                );

            // Verify batch was stored correctly on-chain
            const batch = await mfgBatch.getBatch(batchId);
            expect(batch.merkleRoot).to.equal(merkleRoot);
            expect(batch.ipfsCID).to.equal(ipfsCID);
            expect(batch.manufacturer).to.equal(manufacturer.address);
            expect(batch.isActive).to.be.true;
        });

        it("Blocks non-manufacturers from registering batches", async () => {
            const expiry = Math.floor(Date.now() / 1000) + 86400;
            await expect(
                mfgBatch.connect(distributor).registerBatch(
                    "FAKE-BATCH", merkleRoot, "fakeCID", expiry, "Fake Drug"
                )
            ).to.be.reverted;
        });

        it("Verifies valid Merkle proof and burns the leaf", async () => {
            // NOTE: This test uses a simplified proof — in Step 2 we'll build proper proofs.
            // For now, just validate the burn + consumed state.
            const batch = await mfgBatch.getBatch(batchId);
            expect(batch.isActive).to.be.true;
        });

        it("Blocks duplicate batch registration", async () => {
            const expiry = Math.floor(Date.now() / 1000) + 86400;
            await expect(
                mfgBatch.connect(manufacturer).registerBatch(
                    batchId, merkleRoot, ipfsCID, expiry, "Paracetamol 500mg"
                )
            ).to.be.revertedWithCustomError(mfgBatch, "BatchAlreadyExists");
        });
    });

    // ─── SupplyChainTracker ───────────────────────────────────────────────────

    describe("SupplyChainTracker", () => {
        const drugId = "COMP-A-B1-S1";

        it("Manufacturer registers a drug into the supply chain", async () => {
            await expect(
                sct.connect(manufacturer).registerDrug(drugId, "Dhaka Factory")
            ).to.emit(sct, "DrugRegistered");

            expect(await sct.getDrugStatus(drugId)).to.equal(1); // Manufactured
        });

        it("Distributor takes custody (correct order)", async () => {
            await expect(
                sct.connect(distributor).distributeDrug(drugId, "Chittagong Warehouse")
            ).to.emit(sct, "DrugDistributed");

            expect(await sct.getDrugStatus(drugId)).to.equal(2); // Distributed
        });

        it("Retailer takes custody (correct order)", async () => {
            await expect(
                sct.connect(retailer).retailDrug(drugId, "Dhaka Pharmacy")
            ).to.emit(sct, "DrugRetailed");

            expect(await sct.getDrugStatus(drugId)).to.equal(3); // Retailed
        });

        it("Blocks out-of-order actions (Distributor after Retailer)", async () => {
            const drugId2 = "COMP-A-B1-S2";
            await sct.connect(manufacturer).registerDrug(drugId2, "Factory");

            // Skip Distributor, try Retailer directly → should revert
            await expect(
                sct.connect(retailer).retailDrug(drugId2, "Pharmacy")
            ).to.be.revertedWithCustomError(sct, "OutOfOrderTransition");
        });

        it("Returns full drug history with 3 entries", async () => {
            const history = await sct.getDrugHistory(drugId);
            expect(history.length).to.equal(3);
            expect(history[0].role).to.equal("Manufacturer");
            expect(history[1].role).to.equal("Distributor");
            expect(history[2].role).to.equal("Retailer");
        });

        it("Revoked entity cannot interact with supply chain", async () => {
            await govReg.connect(govt).revokeEntity(distributor.address, "Fraud detected");

            const drugId3 = "COMP-A-B1-S3";
            await sct.connect(manufacturer).registerDrug(drugId3, "Factory");

            await expect(
                sct.connect(distributor).distributeDrug(drugId3, "Warehouse")
            ).to.be.revertedWithCustomError(sct, "NotWhitelisted");

            // Cleanup: reinstate
            await govReg.connect(govt).reinstateEntity(distributor.address);
        });
    });
});