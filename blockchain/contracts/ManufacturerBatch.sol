// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "./GovernmentRegistry.sol";

/**
 * @title ManufacturerBatch
 * @notice Layer 2 — Stores batch Merkle roots and IPFS CIDs.
 *         Only government-whitelisted Manufacturers can register batches.
 *         Consumers verify strip authenticity via Merkle proofs.
 *         One-time burn mechanism prevents QR reuse / replay attacks.
 */
contract ManufacturerBatch {
    // ─── State ────────────────────────────────────────────────────────────────

    GovernmentRegistry public immutable governmentRegistry;

    struct Batch {
        bytes32 merkleRoot;
        string ipfsCID; // IPFS CID of the full Merkle tree JSON
        uint256 expiryDate; // Unix timestamp — drug expiry
        uint256 registeredAt; // Block timestamp of registration
        address manufacturer; // Who registered this batch
        string drugName; // Human-readable drug name
        bool isActive; // Government can deactivate a batch (recall)
    }

    // batchId (string, e.g. "COMP-A-B1") => Batch
    mapping(string => Batch) private _batches;

    // leaf hash => consumed flag (the Burn Mechanism)
    // keccak256(secret) is the leaf; once verified and burned, it cannot be reused.
    mapping(bytes32 => bool) public isConsumed;

    // Track which batchIds a manufacturer has registered
    mapping(address => string[]) private _manufacturerBatches;

    // ─── Events ───────────────────────────────────────────────────────────────

    event BatchRegistered(
        string indexed batchId,
        address indexed manufacturer,
        bytes32 merkleRoot,
        string ipfsCID,
        uint256 expiryDate,
        uint256 timestamp
    );

    event StripVerified(
        string indexed batchId,
        bytes32 indexed leafHash,
        address indexed verifiedBy, // Relayer address
        uint256 timestamp
    );

    event BatchDeactivated(
        string indexed batchId,
        string reason,
        uint256 timestamp
    );

    event BatchReactivated(string indexed batchId, uint256 timestamp);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error NotAuthorized(address caller);
    error NotAManufacturer(address caller);
    error BatchAlreadyExists(string batchId);
    error BatchNotFound(string batchId);
    error BatchInactive(string batchId);
    error StripAlreadyConsumed(bytes32 leafHash);
    error InvalidMerkleProof();
    error BatchExpired(string batchId, uint256 expiryDate);
    error InvalidExpiry();

    // ─── Modifier ─────────────────────────────────────────────────────────────

    modifier onlyWhitelistedManufacturer() {
        if (!governmentRegistry.isWhitelisted(msg.sender)) {
            revert NotAuthorized(msg.sender);
        }
        if (
            !governmentRegistry.hasRole(
                msg.sender,
                GovernmentRegistry.EntityRole.Manufacturer
            )
        ) {
            revert NotAManufacturer(msg.sender);
        }
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address governmentRegistryAddress) {
        require(
            governmentRegistryAddress != address(0),
            "MB: zero registry address"
        );
        governmentRegistry = GovernmentRegistry(governmentRegistryAddress);
    }

    // ─── Manufacturer Functions ───────────────────────────────────────────────

    /**
     * @notice Register a new drug batch on-chain.
     *         Caller MUST be a government-whitelisted Manufacturer.
     *
     * @param batchId     Unique batch identifier (e.g., "COMP-A-B1").
     * @param merkleRoot  The Merkle root of all strip secrets in this batch.
     * @param ipfsCID     The IPFS CID where the full Merkle tree JSON is pinned.
     * @param expiryDate  Unix timestamp of drug expiry.
     * @param drugName    Human-readable name of the drug.
     */
    function registerBatch(
        string calldata batchId,
        bytes32 merkleRoot,
        string calldata ipfsCID,
        uint256 expiryDate,
        string calldata drugName
    ) external onlyWhitelistedManufacturer {
        require(bytes(batchId).length > 0, "MB: empty batchId");
        require(bytes(ipfsCID).length > 0, "MB: empty CID");
        require(bytes(drugName).length > 0, "MB: empty drugName");
        require(merkleRoot != bytes32(0), "MB: zero merkle root");

        if (expiryDate <= block.timestamp) revert InvalidExpiry();
        if (_batches[batchId].registeredAt != 0)
            revert BatchAlreadyExists(batchId);

        _batches[batchId] = Batch({
            merkleRoot: merkleRoot,
            ipfsCID: ipfsCID,
            expiryDate: expiryDate,
            registeredAt: block.timestamp,
            manufacturer: msg.sender,
            drugName: drugName,
            isActive: true
        });

        _manufacturerBatches[msg.sender].push(batchId);

        emit BatchRegistered(
            batchId,
            msg.sender,
            merkleRoot,
            ipfsCID,
            expiryDate,
            block.timestamp
        );
    }

    // ─── Consumer Verification (Called by Relayer Backend) ───────────────────

    /**
     * @notice Verify a strip's authenticity and burn the leaf hash to prevent reuse.
     *         Called by the backend relayer on behalf of the consumer.
     *
     * @param batchId    The batch this strip belongs to.
     * @param proof      The Merkle proof array.
     * @param leafHash   keccak256(secret) — computed locally in the consumer's browser.
     *
     * @return expired   True if drug is authentic but past expiry.
     */
    function verifyAndBurn(
        string calldata batchId,
        bytes32[] calldata proof,
        bytes32 leafHash
    ) external returns (bool expired) {
        Batch storage batch = _batches[batchId];

        // 1. Batch must exist
        if (batch.registeredAt == 0) revert BatchNotFound(batchId);

        // 2. Batch must be active (not recalled)
        if (!batch.isActive) revert BatchInactive(batchId);

        // 3. Anti-replay: leaf must not have been consumed before
        if (isConsumed[leafHash]) revert StripAlreadyConsumed(leafHash);

        // 4. Merkle proof verification
        // Use processProof to verify — compatible with single-hashed leaves
        bool valid = MerkleProof.verify(proof, batch.merkleRoot, leafHash);
        if (!valid) revert InvalidMerkleProof();

        // 5. Burn the leaf — mark as consumed (one-time use)
        isConsumed[leafHash] = true;

        emit StripVerified(batchId, leafHash, msg.sender, block.timestamp);

        // 6. Return expiry status
        //    The consumer frontend uses this to show ✅ or ⚠️
        expired = block.timestamp > batch.expiryDate;
    }

    // ─── Government-Only Batch Management ────────────────────────────────────

    /**
     * @notice Deactivate a batch (drug recall). Only the GovernmentRegistry owner can call.
     *         Uses governmentRegistry.owner() as the authority.
     */
    function deactivateBatch(
        string calldata batchId,
        string calldata reason
    ) external {
        require(
            msg.sender == governmentRegistry.owner(),
            "MB: only government"
        );
        Batch storage batch = _batches[batchId];
        if (batch.registeredAt == 0) revert BatchNotFound(batchId);
        require(batch.isActive, "MB: already inactive");

        batch.isActive = false;
        emit BatchDeactivated(batchId, reason, block.timestamp);
    }

    /**
     * @notice Reactivate a previously deactivated batch.
     */
    function reactivateBatch(string calldata batchId) external {
        require(
            msg.sender == governmentRegistry.owner(),
            "MB: only government"
        );
        Batch storage batch = _batches[batchId];
        if (batch.registeredAt == 0) revert BatchNotFound(batchId);
        require(!batch.isActive, "MB: already active");

        batch.isActive = true;
        emit BatchReactivated(batchId, block.timestamp);
    }

    // ─── View Functions ───────────────────────────────────────────────────────

    /**
     * @notice Fetch batch metadata. Used by the relayer to get the IPFS CID
     *         and Merkle root for a given batchId.
     */
    function getBatch(
        string calldata batchId
    ) external view returns (Batch memory) {
        return _batches[batchId];
    }

    /**
     * @notice Get all batch IDs registered by a specific manufacturer.
     */
    function getManufacturerBatches(
        address manufacturer
    ) external view returns (string[] memory) {
        return _manufacturerBatches[manufacturer];
    }

    /**
     * @notice Quick check — is a specific leaf hash already consumed?
     */
    function isLeafConsumed(bytes32 leafHash) external view returns (bool) {
        return isConsumed[leafHash];
    }
}
