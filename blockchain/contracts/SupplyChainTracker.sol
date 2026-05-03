// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./GovernmentRegistry.sol";

/**
 * @title SupplyChainTracker
 * @notice Layer 3 — Records every custody transfer of a drug strip through the
 *         supply chain (Manufacturer → Distributor → Retailer).
 *
 *         Enforces strict ordering via a State Machine enum.
 *         Every actor is verified against GovernmentRegistry before any action.
 *         Provides full public transparency of a drug's journey.
 */
contract SupplyChainTracker {
    // ─── Enums ────────────────────────────────────────────────────────────────

    enum Status {
        NotRegistered, // 0
        Manufactured, // 1
        Distributed, // 2
        Retailed, // 3
        Consumed // 4
    }

    // ─── Structs ──────────────────────────────────────────────────────────────

    struct Verification {
        address actor; // Who performed this action
        string role; // Human-readable role ("Manufacturer", "Distributor", "Retailer")
        Status status; // The status set by this action
        uint256 timestamp; // Block timestamp
        string location; // Optional: GPS or city string (off-chain hint, not verified)
    }

    // ─── State ────────────────────────────────────────────────────────────────

    GovernmentRegistry public immutable governmentRegistry;

    // drugId (e.g. "COMP-A-B1-S1") => ordered list of verifications
    mapping(string => Verification[]) public drugHistory;

    // drugId => current Status (enforces the state machine)
    mapping(string => Status) public drugStatus;

    // ─── Events ───────────────────────────────────────────────────────────────

    event DrugRegistered(
        string indexed drugId,
        address indexed manufacturer,
        uint256 timestamp
    );

    event DrugDistributed(
        string indexed drugId,
        address indexed distributor,
        uint256 timestamp
    );

    event DrugRetailed(
        string indexed drugId,
        address indexed retailer,
        uint256 timestamp
    );

    event DrugConsumed(
        string indexed drugId,
        address indexed relayer,
        uint256 timestamp
    );

    // ─── Errors ───────────────────────────────────────────────────────────────

    error NotWhitelisted(address caller);
    error WrongRole(address caller, string expectedRole);
    error OutOfOrderTransition(string drugId, Status current, Status attempted);
    error DrugAlreadyRegistered(string drugId);
    error DrugNotFound(string drugId);

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyActive() {
        if (!governmentRegistry.isWhitelisted(msg.sender)) {
            revert NotWhitelisted(msg.sender);
        }
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address governmentRegistryAddress) {
        require(
            governmentRegistryAddress != address(0),
            "SCT: zero registry address"
        );
        governmentRegistry = GovernmentRegistry(governmentRegistryAddress);
    }

    // ─── Supply Chain Actions ─────────────────────────────────────────────────

    /**
     * @notice Step 1 — Manufacturer registers a drug strip into the supply chain.
     *         MUST be called before a Distributor or Retailer can interact with this drugId.
     *
     * @param drugId    The unique strip identifier (e.g., "COMP-A-B1-S1").
     * @param location  Optional human-readable location string.
     */
    function registerDrug(
        string calldata drugId,
        string calldata location
    ) external onlyActive {
        // Role check: must be a Manufacturer
        if (
            !governmentRegistry.hasRole(
                msg.sender,
                GovernmentRegistry.EntityRole.Manufacturer
            )
        ) {
            revert WrongRole(msg.sender, "Manufacturer");
        }

        // State check: must not already exist
        if (drugStatus[drugId] != Status.NotRegistered) {
            revert DrugAlreadyRegistered(drugId);
        }

        drugStatus[drugId] = Status.Manufactured;

        drugHistory[drugId].push(
            Verification({
                actor: msg.sender,
                role: "Manufacturer",
                status: Status.Manufactured,
                timestamp: block.timestamp,
                location: location
            })
        );

        emit DrugRegistered(drugId, msg.sender, block.timestamp);
    }

    /**
     * @notice Step 2 — Distributor scans the Public QR and accepts custody.
     *         Reverts if the drug hasn't been registered by a Manufacturer first.
     *
     * @param drugId    The unique strip identifier.
     * @param location  Optional human-readable location string.
     */
    function distributeDrug(
        string calldata drugId,
        string calldata location
    ) external onlyActive {
        // Role check: must be a Distributor
        if (
            !governmentRegistry.hasRole(
                msg.sender,
                GovernmentRegistry.EntityRole.Distributor
            )
        ) {
            revert WrongRole(msg.sender, "Distributor");
        }

        // State machine: MUST currently be Manufactured
        if (drugStatus[drugId] != Status.Manufactured) {
            revert OutOfOrderTransition(
                drugId,
                drugStatus[drugId],
                Status.Distributed
            );
        }

        drugStatus[drugId] = Status.Distributed;

        drugHistory[drugId].push(
            Verification({
                actor: msg.sender,
                role: "Distributor",
                status: Status.Distributed,
                timestamp: block.timestamp,
                location: location
            })
        );

        emit DrugDistributed(drugId, msg.sender, block.timestamp);
    }

    /**
     * @notice Step 3 — Retailer scans the Public QR and accepts custody.
     *         Reverts if the drug hasn't passed through a Distributor first.
     *
     * @param drugId    The unique strip identifier.
     * @param location  Optional human-readable location string.
     */
    function retailDrug(
        string calldata drugId,
        string calldata location
    ) external onlyActive {
        // Role check: must be a Retailer
        if (
            !governmentRegistry.hasRole(
                msg.sender,
                GovernmentRegistry.EntityRole.Retailer
            )
        ) {
            revert WrongRole(msg.sender, "Retailer");
        }

        // State machine: MUST currently be Distributed
        if (drugStatus[drugId] != Status.Distributed) {
            revert OutOfOrderTransition(
                drugId,
                drugStatus[drugId],
                Status.Retailed
            );
        }

        drugStatus[drugId] = Status.Retailed;

        drugHistory[drugId].push(
            Verification({
                actor: msg.sender,
                role: "Retailer",
                status: Status.Retailed,
                timestamp: block.timestamp,
                location: location
            })
        );

        emit DrugRetailed(drugId, msg.sender, block.timestamp);
    }

    /**
     * @notice Step 4 — Record consumer verification (Consumed).
     * @notice Called by the backend relayer after successful verifyAndBurn().
     * @notice No wallet required from consumer — relayer calls this.
     *
     * @param drugId    The unique strip identifier.
     * @param location  Optional location string.
     */
    function consumeDrug(
        string calldata drugId,
        string calldata location
    ) external {
        // State machine: MUST currently be Retailed
        if (drugStatus[drugId] != Status.Retailed) {
            revert OutOfOrderTransition(
                drugId,
                drugStatus[drugId],
                Status.Consumed
            );
        }

        drugStatus[drugId] = Status.Consumed;

        drugHistory[drugId].push(
            Verification({
                actor: msg.sender, // Relayer address
                role: "Consumer",
                status: Status.Consumed,
                timestamp: block.timestamp,
                location: location
            })
        );

        emit DrugConsumed(drugId, msg.sender, block.timestamp);
    }

    // ─── View Functions ───────────────────────────────────────────────────────

    /**
     * @notice Get the full verification history of a drug strip.
     *         Powers the consumer-facing "Timeline" display.
     */
    function getDrugHistory(
        string calldata drugId
    ) external view returns (Verification[] memory) {
        return drugHistory[drugId];
    }

    /**
     * @notice Get the current status of a drug strip.
     */
    function getDrugStatus(
        string calldata drugId
    ) external view returns (Status) {
        return drugStatus[drugId];
    }

    /**
     * @notice Get the number of checkpoints recorded for a drug strip.
     */
    function getHistoryLength(
        string calldata drugId
    ) external view returns (uint256) {
        return drugHistory[drugId].length;
    }
}
