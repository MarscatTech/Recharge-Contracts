// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MarscatRecharge is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ─── Data Structures ─────────────────────────────────────────

    struct RechargeRecord {
        uint256 expiredAt; // Expiration timestamp (seconds)
    }

    // ─── State Variables ─────────────────────────────────────────

    // packageId => token => amount
    mapping(uint8 => mapping(address => uint256)) public packagePrices;

    // packageId => duration (seconds)
    mapping(uint8 => uint256) public packageDurations;

    // rechargeAddress => RechargeRecord
    mapping(address => RechargeRecord) public rechargeRecords;

    // ─── Events ──────────────────────────────────────────────────

    event Recharged(
        address indexed sender,
        address indexed rechargeAddress,
        uint8   indexed packageId,
        address         token,
        uint256         amount,
        uint256         expiredAt
    );

    event PackagePriceUpdated(
        uint8   indexed packageId,
        address indexed token,
        uint256         amount
    );

    event PackageDurationUpdated(
        uint8   indexed packageId,
        uint256         duration
    );

    event TokenWithdrawn(
        address indexed token,
        address indexed to,
        uint256         amount
    );

    // ─── Constructor ─────────────────────────────────────────────

    constructor() Ownable(msg.sender) {}

    // ─── User Interface ──────────────────────────────────────────

    /**
     * @notice Recharge a subscription. Caller must approve the contract to spend the token before calling.
     * @param packageId Package type
     * @param token Recharge token address
     * @param rechargeAddress Recharge address (the address that receives the subscription benefit)
     */
    function recharge(
        uint8   packageId,
        address token,
        address rechargeAddress
    ) external nonReentrant whenNotPaused {
        require(rechargeAddress != address(0), "Invalid recharge address");
        require(rechargeAddress.code.length == 0, "Cannot recharge to contract address");

        uint256 amount = packagePrices[packageId][token];
        require(amount > 0, "Token not supported for this package");

        uint256 duration = packageDurations[packageId];
        require(duration > 0, "Package duration not set");

        // Transfer tokens from user wallet to contract
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        // Update recharge record
        RechargeRecord storage record = rechargeRecords[rechargeAddress];

        if (record.expiredAt == 0 || block.timestamp >= record.expiredAt) {
            // No record or already expired: calculate from current time
            record.expiredAt = block.timestamp + duration;
        } else {
            // Not yet expired: extend from current expiration time
            record.expiredAt = record.expiredAt + duration;
        }

        emit Recharged(msg.sender, rechargeAddress, packageId, token, amount, record.expiredAt);
    }

    /**
     * @notice Query the expiration time by recharge address
     * @param rechargeAddress Recharge address
     * @return Expiration timestamp in seconds; 0 means no recharge record exists
     */
    function getExpiredAt(
        address rechargeAddress
    ) external view returns (uint256) {
        return rechargeRecords[rechargeAddress].expiredAt;
    }

    // ─── Admin Interface ─────────────────────────────────────────

    /**
     * @notice Set the price for a package
     * @param packageId Package type
     * @param token Token address
     * @param amount Corresponding amount (in smallest unit)
     */
    function setPackagePrice(
        uint8   packageId,
        address token,
        uint256 amount
    ) external onlyOwner {
        require(token != address(0), "Invalid token address");
        require(amount > 0, "Amount must be greater than 0");
        packagePrices[packageId][token] = amount;
        emit PackagePriceUpdated(packageId, token, amount);
    }

    /**
     * @notice Set the duration for a package
     * @param packageId Package type
     * @param duration Duration in seconds
     */
    function setPackageDuration(
        uint8   packageId,
        uint256 duration
    ) external onlyOwner {
        require(duration > 0, "Duration must be greater than 0");
        packageDurations[packageId] = duration;
        emit PackageDurationUpdated(packageId, duration);
    }

    /**
     * @notice Withdraw a specified token balance from the contract to a given address
     * @param token Token address
     * @param to Recipient address
     * @param amount Amount to withdraw
     */
    function withdrawToken(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        require(to != address(0), "Invalid recipient address");
        require(amount > 0, "Amount must be greater than 0");
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(amount <= balance, "Insufficient contract balance");
        IERC20(token).safeTransfer(to, amount);
        emit TokenWithdrawn(token, to, amount);
    }

    /**
     * @notice Pause the recharge functionality for emergency use
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Resume the recharge functionality
     */
    function unpause() external onlyOwner {
        _unpause();
    }
}