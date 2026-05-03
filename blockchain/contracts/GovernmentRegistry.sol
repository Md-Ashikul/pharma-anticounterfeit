// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title GovernmentRegistry
 * @notice Layer 1 — The absolute root of trust for the entire system.
 *         Only the deploying government address (owner) can whitelist or revoke entities.
 *         All other contracts query THIS contract before any privileged action.
 */
contract GovernmentRegistry is Ownable {

    // ─── Enums ────────────────────────────────────────────────────────────────

    enum EntityRole { None, Manufacturer, Distributor, Retailer }
    enum LicenseStatus { NotRegistered, Active, Revoked }

    // ─── Structs ──────────────────────────────────────────────────────────────

    struct Entity {
        string name;
        string licenseNumber;
        EntityRole role;
        LicenseStatus status;
        uint256 registeredAt;
        uint256 revokedAt;       // 0 if never revoked
    }

    // ─── State ────────────────────────────────────────────────────────────────

    mapping(address => Entity) private _entities;

    // Iterable list of all registered addresses (for off-chain enumeration)
    address[] private _registeredAddresses;

    // ─── Events ───────────────────────────────────────────────────────────────

    event EntityRegistered(
        address indexed wallet,
        string name,
        string licenseNumber,
        EntityRole role,
        uint256 timestamp
    );

    event EntityRevoked(
        address indexed wallet,
        string reason,
        uint256 timestamp
    );

    event EntityReinstated(
        address indexed wallet,
        uint256 timestamp
    );

    // ─── Constructor ──────────────────────────────────────────────────────────

    /**
     * @param governmentAddress The wallet address of the government authority.
     *        This becomes the Ownable `owner` — the only address that can modify the registry.
     */
    constructor(address governmentAddress) Ownable(governmentAddress) {}

    // ─── Owner-Only Functions (Government Actions) ────────────────────────────

    /**
     * @notice Register a new licensed entity (Manufacturer, Distributor, or Retailer).
     * @param wallet         The Ethereum wallet address of the entity.
     * @param name           Legal name of the entity.
     * @param licenseNumber  Government-issued license number.
     * @param role           EntityRole enum value (1=Manufacturer, 2=Distributor, 3=Retailer).
     */
    function registerEntity(
        address wallet,
        string calldata name,
        string calldata licenseNumber,
        EntityRole role
    ) external onlyOwner {
        require(wallet != address(0), "GovReg: zero address");
        require(bytes(name).length > 0, "GovReg: empty name");
        require(bytes(licenseNumber).length > 0, "GovReg: empty license");
        require(role != EntityRole.None, "GovReg: invalid role");
        require(
            _entities[wallet].status == LicenseStatus.NotRegistered,
            "GovReg: already registered"
        );

        _entities[wallet] = Entity({
            name: name,
            licenseNumber: licenseNumber,
            role: role,
            status: LicenseStatus.Active,
            registeredAt: block.timestamp,
            revokedAt: 0
        });

        _registeredAddresses.push(wallet);

        emit EntityRegistered(wallet, name, licenseNumber, role, block.timestamp);
    }

    /**
     * @notice Revoke an entity's license. Instantly blocks them from all system interactions.
     * @param wallet  The wallet address of the entity to revoke.
     * @param reason  A short reason string for the revocation (stored in event, not state).
     */
    function revokeEntity(
        address wallet,
        string calldata reason
    ) external onlyOwner {
        require(
            _entities[wallet].status == LicenseStatus.Active,
            "GovReg: not active"
        );

        _entities[wallet].status = LicenseStatus.Revoked;
        _entities[wallet].revokedAt = block.timestamp;

        emit EntityRevoked(wallet, reason, block.timestamp);
    }

    /**
     * @notice Reinstate a previously revoked entity (e.g., after compliance review).
     * @param wallet  The wallet address of the entity to reinstate.
     */
    function reinstateEntity(address wallet) external onlyOwner {
        require(
            _entities[wallet].status == LicenseStatus.Revoked,
            "GovReg: not revoked"
        );

        _entities[wallet].status = LicenseStatus.Active;
        _entities[wallet].revokedAt = 0;

        emit EntityReinstated(wallet, block.timestamp);
    }

    // ─── Public View Functions ────────────────────────────────────────────────

    /**
     * @notice Primary authorization check used by ALL other contracts.
     * @param wallet  The address to check.
     * @return True ONLY if the entity is registered AND currently Active.
     */
    function isWhitelisted(address wallet) external view returns (bool) {
        return _entities[wallet].status == LicenseStatus.Active;
    }

    /**
     * @notice Check if an address holds a specific active role.
     * @param wallet  The address to check.
     * @param role    The required EntityRole.
     * @return True if the wallet is active AND has the specified role.
     */
    function hasRole(address wallet, EntityRole role) external view returns (bool) {
        Entity storage e = _entities[wallet];
        return e.status == LicenseStatus.Active && e.role == role;
    }

    /**
     * @notice Retrieve the full entity record for a given wallet.
     * @param wallet  The address to look up.
     */
    function getEntity(address wallet) external view returns (Entity memory) {
        return _entities[wallet];
    }

    /**
     * @notice Returns the role string of an active entity. Empty string if not active.
     *         Mirrors the architecture's `entityRole` mapping but as a derived view.
     */
    function getEntityRoleString(address wallet) external view returns (string memory) {
        Entity storage e = _entities[wallet];
        if (e.status != LicenseStatus.Active) return "";
        if (e.role == EntityRole.Manufacturer) return "Manufacturer";
        if (e.role == EntityRole.Distributor)  return "Distributor";
        if (e.role == EntityRole.Retailer)     return "Retailer";
        return "";
    }

    /**
     * @notice Returns all registered addresses (for off-chain indexing / government dashboard).
     */
    function getAllRegisteredAddresses() external view returns (address[] memory) {
        return _registeredAddresses;
    }
}