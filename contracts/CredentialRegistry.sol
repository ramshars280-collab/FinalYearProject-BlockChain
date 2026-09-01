// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title CredentialRegistry
 * @dev Anchors 32-byte Merkle roots of academic degree batches to Ethereum
 * and maintains dynamic O(1) bitmap revocation states without recomputing trees.
 */
contract CredentialRegistry {
    struct BatchMetadata {
        bytes32 merkleRoot;
        string ipfsCid;
        uint256 timestamp;
        address issuer;
        bool exists;
    }

    address public owner;
    mapping(address => bool) public authorizedIssuers;

    // batchId hash -> BatchMetadata
    mapping(bytes32 => BatchMetadata) private _batches;

    // batchId hash -> wordIndex -> 256-bit bitmap of revoked leaf indices
    mapping(bytes32 => mapping(uint256 => uint256)) private _revocations;

    // batchId hash -> count of revoked credentials
    mapping(bytes32 => uint256) private _revocationCounts;

    event BatchAnchored(
        string indexed batchIdIndexed,
        string batchId,
        bytes32 merkleRoot,
        string ipfsCid,
        uint256 timestamp,
        address indexed issuer
    );

    event CredentialRevoked(
        string indexed batchIdIndexed,
        string batchId,
        uint256 leafIndex,
        uint256 timestamp,
        address indexed revoker
    );

    event IssuerStatusUpdated(address indexed issuer, bool isAuthorized);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyIssuer() {
        require(
            msg.sender == owner || authorizedIssuers[msg.sender],
            "CredentialRegistry: caller is not authorized issuer"
        );
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "CredentialRegistry: caller is not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        authorizedIssuers[msg.sender] = true;
    }

    /**
     * @notice Anchors a 32-byte Merkle root representing an entire graduating degree batch.
     * @param batchId Unique identifier for graduation batch (e.g. "MGM-2024-BTECH-CSE").
     * @param merkleRoot 32-byte cryptographic root computed via keccak256.
     * @param ipfsCid IPFS CID or cryptographic off-chain manifest reference.
     */
    function anchorMerkleRoot(
        string calldata batchId,
        bytes32 merkleRoot,
        string calldata ipfsCid
    ) external onlyIssuer {
        bytes32 bHash = keccak256(bytes(batchId));
        require(!_batches[bHash].exists, "CredentialRegistry: batch already anchored");
        require(merkleRoot != bytes32(0), "CredentialRegistry: invalid merkle root");

        _batches[bHash] = BatchMetadata({
            merkleRoot: merkleRoot,
            ipfsCid: ipfsCid,
            timestamp: block.timestamp,
            issuer: msg.sender,
            exists: true
        });

        emit BatchAnchored(batchId, batchId, merkleRoot, ipfsCid, block.timestamp, msg.sender);
    }

    /**
     * @notice Revokes a specific credential at `leafIndex` using an O(1) 256-bit bitmap.
     * @param batchId Unique identifier for graduation batch.
     * @param leafIndex 0-indexed leaf position in the Merkle Tree.
     */
    function revokeCredential(string calldata batchId, uint256 leafIndex) external onlyIssuer {
        bytes32 bHash = keccak256(bytes(batchId));
        require(_batches[bHash].exists, "CredentialRegistry: batch does not exist");

        uint256 wordIndex = leafIndex / 256;
        uint256 bitIndex = leafIndex % 256;

        uint256 mask = 1 << bitIndex;
        require((_revocations[bHash][wordIndex] & mask) == 0, "CredentialRegistry: already revoked");

        _revocations[bHash][wordIndex] |= mask;
        _revocationCounts[bHash] += 1;

        emit CredentialRevoked(batchId, batchId, leafIndex, block.timestamp, msg.sender);
    }

    /**
     * @notice Checks if a credential at `leafIndex` in `batchId` is revoked.
     * @param batchId Unique identifier for graduation batch.
     * @param leafIndex 0-indexed leaf position in the Merkle Tree.
     */
    function isCredentialRevoked(string calldata batchId, uint256 leafIndex) public view returns (bool) {
        bytes32 bHash = keccak256(bytes(batchId));
        uint256 wordIndex = leafIndex / 256;
        uint256 bitIndex = leafIndex % 256;
        return (_revocations[bHash][wordIndex] & (1 << bitIndex)) != 0;
    }

    /**
     * @notice Authenticates proof paths against stored Merkle root and checks revocation status.
     * @param batchId Batch ID string.
     * @param leaf Cryptographic leaf hash of the credential.
     * @param proof Merkle proof path hashes.
     * @param leafIndex Index of the credential leaf.
     * @return isValid True if proof matches anchored Merkle root.
     * @return isRevoked True if the credential has been revoked in the bitmap.
     */
    function verifyCredential(
        string calldata batchId,
        bytes32 leaf,
        bytes32[] calldata proof,
        uint256 leafIndex
    ) external view returns (bool isValid, bool isRevoked) {
        bytes32 bHash = keccak256(bytes(batchId));
        BatchMetadata memory batch = _batches[bHash];

        if (!batch.exists) {
            return (false, false);
        }

        bool validProof = verifyMerkleProof(proof, batch.merkleRoot, leaf);
        bool revoked = isCredentialRevoked(batchId, leafIndex);

        return (validProof, revoked);
    }

    /**
     * @notice Returns batch metadata and anchored root.
     */
    function getBatchInfo(string calldata batchId) external view returns (
        bytes32 merkleRoot,
        string memory ipfsCid,
        uint256 timestamp,
        address issuer,
        bool exists
    ) {
        bytes32 bHash = keccak256(bytes(batchId));
        BatchMetadata memory b = _batches[bHash];
        return (b.merkleRoot, b.ipfsCid, b.timestamp, b.issuer, b.exists);
    }

    /**
     * @dev Internal helper for verifying Merkle proofs with commutative pairs.
     */
    function verifyMerkleProof(
        bytes32[] memory proof,
        bytes32 root,
        bytes32 leaf
    ) internal pure returns (bool) {
        bytes32 computedHash = leaf;

        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 proofElement = proof[i];
            if (computedHash <= proofElement) {
                computedHash = keccak256(abi.encodePacked(computedHash, proofElement));
            } else {
                computedHash = keccak256(abi.encodePacked(proofElement, computedHash));
            }
        }

        return computedHash == root;
    }

    function setIssuerAuthorization(address issuer, bool isAuthorized) external onlyOwner {
        require(issuer != address(0), "CredentialRegistry: zero address");
        authorizedIssuers[issuer] = isAuthorized;
        emit IssuerStatusUpdated(issuer, isAuthorized);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "CredentialRegistry: zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
