// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IdentityRegistry
 * @dev Cryptographically binds student PRNs (Permanent Registration Numbers)
 * to their verified MetaMask / Web3 wallet addresses using EIP-712 signatures.
 * Adheres to DPDP Act with zero-PII storage on-chain.
 */
contract IdentityRegistry {
    // EIP-712 Type Hashes
    bytes32 public constant EIP712_DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );

    bytes32 public constant IDENTITY_BINDING_TYPEHASH = keccak256(
        "IdentityBinding(string prn,address wallet,uint256 timestamp)"
    );

    bytes32 public constant IDENTITY_HASH_BINDING_TYPEHASH = keccak256(
        "IdentityHashBinding(bytes32 prnHash,address wallet,uint256 timestamp)"
    );

    bytes32 public immutable DOMAIN_SEPARATOR;
    address public owner;

    // Plaintext PRN -> Bound Wallet Address
    mapping(string => address) private _prnToWallet;
    mapping(address => string) private _walletToPrn;
    mapping(string => uint256) private _prnBindingTimestamp;

    // Zero-PII Cryptographic Hash Commitments: bytes32 PRN Hash -> Wallet Address
    mapping(bytes32 => address) private _prnHashToWallet;
    mapping(address => bytes32) private _walletToPrnHash;
    mapping(bytes32 => uint256) private _prnHashBindingTimestamp;

    event IdentityBound(
        string indexed prnIndexed,
        string prn,
        address indexed wallet,
        uint256 timestamp
    );
    event ZeroPiiIdentityBound(
        bytes32 indexed prnHash,
        address indexed wallet,
        uint256 timestamp
    );
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "IdentityRegistry: caller is not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                keccak256(bytes("SOET VeriTrust")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    /**
     * @notice Cryptographically binds a student PRN to msg.sender via EIP-712 signature.
     * @param prn Permanent Registration Number of the student.
     * @param timestamp Signature issuance timestamp.
     * @param signature Cryptographic ECDSA signature (65 bytes: r, s, v).
     */
    function bindIdentity(
        string calldata prn,
        uint256 timestamp,
        bytes calldata signature
    ) external {
        require(bytes(prn).length > 0, "IdentityRegistry: PRN cannot be empty");
        require(_prnToWallet[prn] == address(0), "IdentityRegistry: PRN already bound");
        require(bytes(_walletToPrn[msg.sender]).length == 0, "IdentityRegistry: wallet already bound to a PRN");
        require(signature.length == 65, "IdentityRegistry: invalid signature length");

        // Verify EIP-712 Signature
        bytes32 structHash = keccak256(
            abi.encode(
                IDENTITY_BINDING_TYPEHASH,
                keccak256(bytes(prn)),
                msg.sender,
                timestamp
            )
        );

        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash)
        );

        address signer = recoverSigner(digest, signature);
        require(signer == msg.sender, "IdentityRegistry: signature does not match msg.sender");

        // Commit binding
        _prnToWallet[prn] = msg.sender;
        _walletToPrn[msg.sender] = prn;
        _prnBindingTimestamp[prn] = block.timestamp;

        emit IdentityBound(prn, prn, msg.sender, block.timestamp);
    }

    /**
     * @notice Zero-PII Identity Binding: Binds 32-byte Keccak-256 PRN commitment hash to wallet without storing plaintext PRN on-chain.
     * @param prnHash Keccak-256 cryptographic hash of student PRN: keccak256(bytes(prn)).
     * @param timestamp Signature issuance timestamp.
     * @param signature Cryptographic ECDSA signature (65 bytes: r, s, v).
     */
    function bindIdentityZeroPii(
        bytes32 prnHash,
        uint256 timestamp,
        bytes calldata signature
    ) external {
        require(prnHash != bytes32(0), "IdentityRegistry: PRN hash cannot be zero");
        require(_prnHashToWallet[prnHash] == address(0), "IdentityRegistry: PRN hash already bound");
        require(_walletToPrnHash[msg.sender] == bytes32(0), "IdentityRegistry: wallet already bound");
        require(signature.length == 65, "IdentityRegistry: invalid signature length");

        bytes32 structHash = keccak256(
            abi.encode(
                IDENTITY_HASH_BINDING_TYPEHASH,
                prnHash,
                msg.sender,
                timestamp
            )
        );

        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash)
        );

        address signer = recoverSigner(digest, signature);
        require(signer == msg.sender, "IdentityRegistry: signature does not match msg.sender");

        _prnHashToWallet[prnHash] = msg.sender;
        _walletToPrnHash[msg.sender] = prnHash;
        _prnHashBindingTimestamp[prnHash] = block.timestamp;

        emit ZeroPiiIdentityBound(prnHash, msg.sender, block.timestamp);
    }

    /**
     * @notice Returns the verified wallet bound to a PRN.
     * @param prn The Permanent Registration Number.
     */
    function getBoundWallet(string calldata prn) external view returns (address) {
        return _prnToWallet[prn];
    }

    /**
     * @notice Returns the verified wallet bound to a 32-byte PRN hash commitment.
     */
    function getBoundWalletByHash(bytes32 prnHash) external view returns (address) {
        return _prnHashToWallet[prnHash];
    }

    /**
     * @notice Returns the PRN bound to a wallet address.
     * @param wallet The student wallet address.
     */
    function getBoundPRN(address wallet) external view returns (string memory) {
        return _walletToPrn[wallet];
    }

    /**
     * @notice Returns the 32-byte PRN hash commitment bound to a wallet address.
     */
    function getBoundPRNHash(address wallet) external view returns (bytes32) {
        return _walletToPrnHash[wallet];
    }

    /**
     * @notice Returns the timestamp when identity was bound.
     */
    function getBindingTimestamp(string calldata prn) external view returns (uint256) {
        return _prnBindingTimestamp[prn];
    }

    /**
     * @dev Internal helper for ECDSA signature recovery.
     */
    function recoverSigner(bytes32 digest, bytes memory signature) internal pure returns (address) {
        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }

        if (v < 27) {
            v += 27;
        }
        require(v == 27 || v == 28, "IdentityRegistry: invalid signature 'v' value");

        return ecrecover(digest, v, r, s);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "IdentityRegistry: new owner is zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
