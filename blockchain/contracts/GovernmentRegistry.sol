// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title GovernmentRegistry
 * @notice Layer 1 — The absolute root of trust. Multi-sig governance via M-of-N voting.
 *
 * Real-world scenario: National regulators, state pharmacy boards, and industry councils
 * must collaboratively approve entity registration, revocation, and reinstatement.
 * No single regulator has unilateral power; threshold voting ensures consensus.
 *
 * Workflow:
 *   1. Any regulator proposes an action (register/revoke/reinstate entity).
 *   2. Regulators vote (1 vote each); proposer auto-votes ✓.
 *   3. When votes >= threshold, proposal auto-executes.
 *   4. Proposals expire after 7 days if not approved.
 *   5. Vote changes are allowed; re-evaluation happens on each vote.
 */
contract GovernmentRegistry is Ownable {

    // ─── Enums ────────────────────────────────────────────────────────────────

    enum EntityRole { None, Manufacturer, Distributor, Retailer }
    enum LicenseStatus { NotRegistered, Active, Revoked }
    enum ProposalStatus { Pending, Executed, Expired, Cancelled }
    enum ProposalAction {
        Register,
        Revoke,
        Reinstate,
        AddRegulator,
        RemoveRegulator
    }

    // ─── Structs ──────────────────────────────────────────────────────────────

    struct Entity {
        string name;
        string licenseNumber;
        EntityRole role;
        LicenseStatus status;
        uint256 registeredAt;
        uint256 revokedAt;
    }

    struct Proposal {
        uint256 id;
        ProposalAction action;
        address targetEntity;           // Entity being registered/revoked/reinstated
        string proposalData;            // JSON or encoded data (name, license, reason, etc.)
        ProposalStatus status;
        address proposer;
        uint256 createdAt;
        uint256 expiryAt;               // 7 days from creation
        uint256 executedAt;             // 0 if not executed
        uint256 approvalsCount;         // Running tally of votes
    }

    // ─── State ────────────────────────────────────────────────────────────────

    address[] private _regulators;
    uint256 private _threshold;         // M-of-N threshold (e.g., 2 of 3)
    uint256 private _nextProposalId = 1;

    mapping(address => Entity) private _entities;
    address[] private _registeredAddresses;

    // Proposal tracking
    mapping(uint256 => Proposal) public proposals;                          // proposalId => proposal
    mapping(uint256 => mapping(address => bool)) public hasVoted;           // proposalId => regulator => voted?
    mapping(uint256 => mapping(address => bool)) public votes;              // proposalId => regulator => voteChoice (true=approve)
    mapping(address => bool) private _isRegulator;

    // ─── Events ───────────────────────────────────────────────────────────────

    event ProposalCreated(
        uint256 indexed proposalId,
        address indexed proposer,
        uint8 action,
        address targetEntity,
        uint256 createdAt,
        uint256 expiryAt
    );

    event ProposalVoted(
        uint256 indexed proposalId,
        address indexed regulator,
        bool voteChoice,
        uint256 currentApprovals,
        uint256 threshold
    );

    event ProposalExecuted(
        uint256 indexed proposalId,
        uint8 action,
        address targetEntity,
        uint256 executedAt
    );

    event ProposalExpired(uint256 indexed proposalId, uint256 expiredAt);

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

    event RegulatorsInitialized(
        address[] regulators,
        uint256 threshold,
        uint256 timestamp
    );

    event RegulatorAdded(
        address indexed newRegulator,
        uint256 timestamp
    );

    event RegulatorRemoved(
        address indexed removedRegulator,
        uint256 timestamp
    );

    // ─── Errors ───────────────────────────────────────────────────────────────

    error NotARegulator(address caller);
    error NotInitialized();
    error ProposalNotFound(uint256 proposalId);
    error ProposalAlreadyVoted(uint256 proposalId, address regulator);
    error ProposalExpiredError(uint256 proposalId);
    error ProposalNotExecutable(uint256 proposalId);
    error RegulatorNotFound(address regulator);
    error ThresholdTooHigh(uint256 threshold, uint256 regulatorCount);

    // ─── Constructor ──────────────────────────────────────────────────────────

    /**
     * @param initialOwner The deploying account. Calls initializeGovernance once to set up regulators.
     */
    constructor(address initialOwner) Ownable(initialOwner) {}

    // ─── Governance Initialization (Owner-Only, Called Once) ─────────────────

    /**
     * @notice Initialize the consortium governance model. Call this once post-deployment.
     * @param regulators_ Array of regulator addresses (e.g., 3 national/regional bodies).
     * @param threshold_  Approval threshold (e.g., 2 for 2-of-3 voting).
     */
    function initializeGovernance(
        address[] calldata regulators_,
        uint256 threshold_
    ) external onlyOwner {
        require(regulators_.length > 0, "GR: no regulators");
        require(threshold_ > 0 && threshold_ <= regulators_.length, "GR: invalid threshold");
        require(_regulators.length == 0, "GR: already initialized");

        for (uint256 i = 0; i < regulators_.length; i++) {
            require(regulators_[i] != address(0), "GR: zero regulator");
            _isRegulator[regulators_[i]] = true;
            _regulators.push(regulators_[i]);
        }

        _threshold = threshold_;

        emit RegulatorsInitialized(regulators_, threshold_, block.timestamp);
    }

    // ─── Proposal Functions (Any Regulator Can Propose) ──────────────────────

    /**
     * @notice Propose registering a new entity. Proposer auto-votes YES.
     */
    function proposeRegisterEntity(
        address wallet,
        string calldata name,
        string calldata licenseNumber,
        EntityRole role
    ) external returns (uint256 proposalId) {
        if (!_isRegulator[msg.sender]) revert NotARegulator(msg.sender);
        require(wallet != address(0), "GR: zero address");
        require(bytes(name).length > 0, "GR: empty name");
        require(bytes(licenseNumber).length > 0, "GR: empty license");
        require(role != EntityRole.None, "GR: invalid role");
        require(
            _entities[wallet].status == LicenseStatus.NotRegistered,
            "GR: already registered"
        );

        proposalId = _createProposal(
            ProposalAction.Register,
            wallet,
            string(abi.encodePacked(name, "|", licenseNumber, "|", Strings.toString(uint256(role))))
        );

        // Proposer auto-votes YES
        _castVote(proposalId, msg.sender, true);
    }

    /**
     * @notice Propose revoking an entity. Proposer auto-votes YES.
     */
    function proposeRevokeEntity(
        address wallet,
        string calldata reason
    ) external returns (uint256 proposalId) {
        if (!_isRegulator[msg.sender]) revert NotARegulator(msg.sender);
        require(
            _entities[wallet].status == LicenseStatus.Active,
            "GR: not active"
        );

        proposalId = _createProposal(
            ProposalAction.Revoke,
            wallet,
            reason
        );

        _castVote(proposalId, msg.sender, true);
    }

    /**
     * @notice Propose reinstating an entity. Proposer auto-votes YES.
     */
    function proposeReinstateEntity(address wallet) external returns (uint256 proposalId) {
        if (!_isRegulator[msg.sender]) revert NotARegulator(msg.sender);
        require(
            _entities[wallet].status == LicenseStatus.Revoked,
            "GR: not revoked"
        );

        proposalId = _createProposal(
            ProposalAction.Reinstate,
            wallet,
            ""
        );

        _castVote(proposalId, msg.sender, true);
    }

    /**
     * @notice Propose adding a new regulator. Requires M-of-N approval.
     */
    function proposeAddRegulator(address newRegulator) external returns (uint256 proposalId) {
        if (!_isRegulator[msg.sender]) revert NotARegulator(msg.sender);
        require(newRegulator != address(0), "GR: zero regulator");
        require(!_isRegulator[newRegulator], "GR: already regulator");

        proposalId = _createProposal(
            ProposalAction.AddRegulator,
            newRegulator,
            ""
        );

        _castVote(proposalId, msg.sender, true);
    }

    /**
     * @notice Propose removing a regulator. Requires M-of-N approval.
     */
    function proposeRemoveRegulator(address regulatorToRemove) external returns (uint256 proposalId) {
        if (!_isRegulator[msg.sender]) revert NotARegulator(msg.sender);
        if (!_isRegulator[regulatorToRemove]) revert RegulatorNotFound(regulatorToRemove);

        proposalId = _createProposal(
            ProposalAction.RemoveRegulator,
            regulatorToRemove,
            ""
        );

        _castVote(proposalId, msg.sender, true);
    }

    // ─── Voting Function ──────────────────────────────────────────────────────

    /**
     * @notice Vote on a proposal. Auto-executes if threshold reached.
     *         Voters can change their vote; proposal re-evaluates.
     */
    function voteOnProposal(uint256 proposalId, bool voteChoice) external {
        if (!_isRegulator[msg.sender]) revert NotARegulator(msg.sender);

        Proposal storage proposal = proposals[proposalId];
        if (proposal.id == 0) revert ProposalNotFound(proposalId);
        if (proposal.status != ProposalStatus.Pending) revert ProposalNotExecutable(proposalId);
        if (block.timestamp > proposal.expiryAt) {
            proposal.status = ProposalStatus.Expired;
            emit ProposalExpired(proposalId, block.timestamp);
            revert ProposalExpiredError(proposalId);
        }

        _castVote(proposalId, msg.sender, voteChoice);

        // Check if threshold met; if so, auto-execute
        if (proposals[proposalId].approvalsCount >= _threshold) {
            _executeProposal(proposalId);
        }
    }

    // ─── Internal Voting & Execution ──────────────────────────────────────────

    function _castVote(uint256 proposalId, address regulator, bool voteChoice) internal {
        Proposal storage proposal = proposals[proposalId];

        // If regulator already voted, recalculate approvals (subtract old vote)
        if (hasVoted[proposalId][regulator]) {
            if (votes[proposalId][regulator]) {
                proposal.approvalsCount--;  // Was YES, now changing
            }
        }

        // Record new vote
        hasVoted[proposalId][regulator] = true;
        votes[proposalId][regulator] = voteChoice;

        // Add to approval count if YES
        if (voteChoice) {
            proposal.approvalsCount++;
        }

        emit ProposalVoted(
            proposalId,
            regulator,
            voteChoice,
            proposal.approvalsCount,
            _threshold
        );
    }

    function _createProposal(
        ProposalAction action,
        address targetEntity,
        string memory data
    ) internal returns (uint256 proposalId) {
        if (_regulators.length == 0) revert NotInitialized();

        proposalId = _nextProposalId++;
        uint256 expiryAt = block.timestamp + 7 days;

        proposals[proposalId] = Proposal({
            id: proposalId,
            action: action,
            targetEntity: targetEntity,
            proposalData: data,
            status: ProposalStatus.Pending,
            proposer: msg.sender,
            createdAt: block.timestamp,
            expiryAt: expiryAt,
            executedAt: 0,
            approvalsCount: 0
        });

        emit ProposalCreated(
            proposalId,
            msg.sender,
            uint8(action),
            targetEntity,
            block.timestamp,
            expiryAt
        );
    }

    function _executeProposal(uint256 proposalId) internal {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.status == ProposalStatus.Pending, "GR: not pending");
        require(proposal.approvalsCount >= _threshold, "GR: threshold not met");

        proposal.status = ProposalStatus.Executed;
        proposal.executedAt = block.timestamp;

        // Execute the action based on proposal type
        if (proposal.action == ProposalAction.Register) {
            _executeRegister(proposal);
        } else if (proposal.action == ProposalAction.Revoke) {
            _executeRevoke(proposal);
        } else if (proposal.action == ProposalAction.Reinstate) {
            _executeReinstate(proposal);
        } else if (proposal.action == ProposalAction.AddRegulator) {
            _executeAddRegulator(proposal.targetEntity);
        } else if (proposal.action == ProposalAction.RemoveRegulator) {
            _executeRemoveRegulator(proposal.targetEntity);
        }

        emit ProposalExecuted(
            proposalId,
            uint8(proposal.action),
            proposal.targetEntity,
            block.timestamp
        );
    }

    function _executeRegister(Proposal storage proposal) internal {
        // Parse data: "name|licenseNumber|role"
        (string memory name, string memory licenseNumber, uint256 roleNum) =
            _parseRegisterData(proposal.proposalData);

        EntityRole role = EntityRole(roleNum);

        _entities[proposal.targetEntity] = Entity({
            name: name,
            licenseNumber: licenseNumber,
            role: role,
            status: LicenseStatus.Active,
            registeredAt: block.timestamp,
            revokedAt: 0
        });

        _registeredAddresses.push(proposal.targetEntity);

        emit EntityRegistered(
            proposal.targetEntity,
            name,
            licenseNumber,
            role,
            block.timestamp
        );
    }

    function _executeRevoke(Proposal storage proposal) internal {
        _entities[proposal.targetEntity].status = LicenseStatus.Revoked;
        _entities[proposal.targetEntity].revokedAt = block.timestamp;

        emit EntityRevoked(proposal.targetEntity, proposal.proposalData, block.timestamp);
    }

    function _executeReinstate(Proposal storage proposal) internal {
        _entities[proposal.targetEntity].status = LicenseStatus.Active;
        _entities[proposal.targetEntity].revokedAt = 0;

        emit EntityReinstated(proposal.targetEntity, block.timestamp);
    }

    function _executeAddRegulator(address newRegulator) internal {
        require(!_isRegulator[newRegulator], "GR: already regulator");
        _isRegulator[newRegulator] = true;
        _regulators.push(newRegulator);

        emit RegulatorAdded(newRegulator, block.timestamp);
    }

    function _executeRemoveRegulator(address regulatorToRemove) internal {
        require(_isRegulator[regulatorToRemove], "GR: not regulator");
        _isRegulator[regulatorToRemove] = false;

        // Remove from array (linear scan; small array expected)
        for (uint256 i = 0; i < _regulators.length; i++) {
            if (_regulators[i] == regulatorToRemove) {
                _regulators[i] = _regulators[_regulators.length - 1];
                _regulators.pop();
                break;
            }
        }

        emit RegulatorRemoved(regulatorToRemove, block.timestamp);
    }

    function _parseRegisterData(
        string memory data
    ) internal pure returns (string memory name, string memory licenseNumber, uint256 role) {
        // Simple parsing: "name|licenseNumber|role"
        // For production, use a more robust decoder or abi.encode / abi.decode
        bytes memory b = bytes(data);
        uint256 firstPipe = _findChar(b, bytes1('|'), 0);
        uint256 secondPipe = _findChar(b, bytes1('|'), firstPipe + 1);

        name = _substring(data, 0, firstPipe);
        licenseNumber = _substring(data, firstPipe + 1, secondPipe);

        // Parse role as uint256
        bytes memory roleStr = bytes(_substring(data, secondPipe + 1, b.length));
        role = _parseUint(roleStr);
    }

    function _findChar(bytes memory data, bytes1 char, uint256 start) internal pure returns (uint256) {
        for (uint256 i = start; i < data.length; i++) {
            if (data[i] == char) return i;
        }
        return data.length;
    }

    function _substring(string memory str, uint256 start, uint256 end) internal pure returns (string memory) {
        bytes memory strBytes = bytes(str);
        bytes memory result = new bytes(end - start);
        for (uint256 i = 0; i < end - start; i++) {
            result[i] = strBytes[start + i];
        }
        return string(result);
    }

    function _parseUint(bytes memory b) internal pure returns (uint256) {
        uint256 result = 0;
        for (uint256 i = 0; i < b.length; i++) {
            uint8 c = uint8(b[i]);
            // Only accept ASCII digits '0'-'9'; ignore anything else so a
            // malformed byte can never cause an arithmetic underflow (Panic 0x11).
            if (c >= 48 && c <= 57) {
                result = result * 10 + (c - 48);
            }
        }
        return result;
    }

    // ─── Manual Execution (Fallback) ───────────────────────────────────────

    /**
     * @notice Manually execute a proposal if somehow it wasn't auto-executed.
     *         Anyone can call; internal checks ensure it's valid.
     */
    function executeProposalManually(uint256 proposalId) external {
        Proposal storage proposal = proposals[proposalId];
        if (proposal.id == 0) revert ProposalNotFound(proposalId);
        if (proposal.status != ProposalStatus.Pending) revert ProposalNotExecutable(proposalId);
        if (proposal.approvalsCount < _threshold) revert ProposalNotExecutable(proposalId);

        _executeProposal(proposalId);
    }

    // ─── View Functions (Keep Existing) ───────────────────────────────────────

    /**
     * @notice Primary authorization check used by ALL other contracts.
     */
    function isWhitelisted(address wallet) external view returns (bool) {
        return _entities[wallet].status == LicenseStatus.Active;
    }

    /**
     * @notice Check if an address holds a specific active role.
     */
    function hasRole(address wallet, EntityRole role) external view returns (bool) {
        Entity storage e = _entities[wallet];
        return e.status == LicenseStatus.Active && e.role == role;
    }

    /**
     * @notice Retrieve the full entity record for a given wallet.
     */
    function getEntity(address wallet) external view returns (Entity memory) {
        return _entities[wallet];
    }

    /**
     * @notice Returns the role string of an active entity.
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
     * @notice Returns all registered addresses.
     */
    function getAllRegisteredAddresses() external view returns (address[] memory) {
        return _registeredAddresses;
    }

    /**
     * @notice Returns the list of active regulators.
     */
    function getRegulators() external view returns (address[] memory) {
        return _regulators;
    }

    /**
     * @notice Returns the current M-of-N threshold.
     */
    function getThreshold() external view returns (uint256) {
        return _threshold;
    }

    /**
     * @notice Get proposal details.
     */
    function getProposal(uint256 proposalId)
        external
        view
        returns (Proposal memory proposal, address[] memory voters, bool[] memory voteChoices)
    {
        proposal = proposals[proposalId];

        // Return voters who have voted and their choices
        voters = new address[](_regulators.length);
        voteChoices = new bool[](_regulators.length);

        uint256 count = 0;
        for (uint256 i = 0; i < _regulators.length; i++) {
            if (hasVoted[proposalId][_regulators[i]]) {
                voters[count] = _regulators[i];
                voteChoices[count] = votes[proposalId][_regulators[i]];
                count++;
            }
        }

        // Trim arrays to actual count
        assembly {
            mstore(voters, count)
            mstore(voteChoices, count)
        }
    }

    /**
     * @notice Check if governance is initialized.
     */
    function isInitialized() external view returns (bool) {
        return _regulators.length > 0;
    }
}
