// Errors.js - Typed error classes for enterprise-grade error handling
// Usage: import { WalletError, NetworkError, ... } from './wallet_wrapper/Errors.js';

/**
 * Base error class for all wallet_wrapper errors.
 * Provides a consistent interface for error handling.
 */
export class KaspaError extends Error {
    constructor(message, code, cause = null) {
        super(message);
        this.name = 'KaspaError';
        this.code = code;
        this.cause = cause;
        Error.captureStackTrace?.(this, this.constructor);
    }

    toJSON() {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            cause: this.cause?.message || null
        };
    }
}

/**
 * Thrown when WASM initialization fails.
 */
export class WasmInitError extends KaspaError {
    constructor(message = 'Failed to initialize Kaspa WASM module', cause = null) {
        super(message, 'WASM_INIT_ERROR', cause);
        this.name = 'WasmInitError';
    }
}

/**
 * Thrown when network connection fails or is unavailable.
 */
export class NetworkError extends KaspaError {
    constructor(message = 'Network connection failed', cause = null) {
        super(message, 'NETWORK_ERROR', cause);
        this.name = 'NetworkError';
    }
}

/**
 * Thrown when RPC call fails.
 */
export class RpcError extends KaspaError {
    constructor(message = 'RPC call failed', cause = null) {
        super(message, 'RPC_ERROR', cause);
        this.name = 'RpcError';
    }
}

/**
 * Thrown when wallet is not initialized or not open.
 */
export class WalletNotOpenError extends KaspaError {
    constructor(message = 'Wallet is not open') {
        super(message, 'WALLET_NOT_OPEN');
        this.name = 'WalletNotOpenError';
    }
}

/**
 * Thrown when wallet creation or opening fails.
 */
export class WalletError extends KaspaError {
    constructor(message = 'Wallet operation failed', cause = null) {
        super(message, 'WALLET_ERROR', cause);
        this.name = 'WalletError';
    }
}

/**
 * Thrown when authentication (password) fails.
 */
export class AuthenticationError extends KaspaError {
    constructor(message = 'Authentication failed') {
        super(message, 'AUTH_ERROR');
        this.name = 'AuthenticationError';
    }
}

/**
 * Thrown when there are insufficient funds for a transaction.
 */
export class InsufficientFundsError extends KaspaError {
    constructor(required, available) {
        super(
            `Insufficient funds: required ${required}, available ${available}`,
            'INSUFFICIENT_FUNDS'
        );
        this.name = 'InsufficientFundsError';
        this.required = required;
        this.available = available;
    }
}

/**
 * Thrown when a transaction is not found.
 */
export class TransactionNotFoundError extends KaspaError {
    constructor(txId) {
        super(`Transaction not found: ${txId}`, 'TX_NOT_FOUND');
        this.name = 'TransactionNotFoundError';
        this.txId = txId;
    }
}

/**
 * Thrown when an address is invalid.
 */
export class InvalidAddressError extends KaspaError {
    constructor(address) {
        super(`Invalid Kaspa address: ${address}`, 'INVALID_ADDRESS');
        this.name = 'InvalidAddressError';
        this.address = address;
    }
}

/**
 * Thrown when an amount is invalid.
 */
export class InvalidAmountError extends KaspaError {
    constructor(amount, reason = 'Invalid amount') {
        super(`${reason}: ${amount}`, 'INVALID_AMOUNT');
        this.name = 'InvalidAmountError';
        this.amount = amount;
    }
}

/**
 * Thrown when a payload is invalid.
 */
export class InvalidPayloadError extends KaspaError {
    constructor(reason = 'Invalid payload') {
        super(reason, 'INVALID_PAYLOAD');
        this.name = 'InvalidPayloadError';
    }
}

/**
 * Thrown when an account is not found.
 */
export class AccountNotFoundError extends KaspaError {
    constructor(accountId = null) {
        super(
            accountId ? `Account not found: ${accountId}` : 'No accounts found in wallet',
            'ACCOUNT_NOT_FOUND'
        );
        this.name = 'AccountNotFoundError';
        this.accountId = accountId;
    }
}

/**
 * Thrown when a transaction fails.
 */
export class TransactionError extends KaspaError {
    constructor(message = 'Transaction failed', cause = null) {
        super(message, 'TX_FAILED', cause);
        this.name = 'TransactionError';
    }
}

/**
 * Thrown when an event subscription fails.
 */
export class EventError extends KaspaError {
    constructor(message = 'Event subscription failed', cause = null) {
        super(message, 'EVENT_ERROR', cause);
        this.name = 'EventError';
    }
}

/**
 * Thrown when UtxoContext is not initialized.
 */
export class UtxoContextNotInitializedError extends KaspaError {
    constructor() {
        super('UtxoContext is not initialized', 'UTXO_NOT_INITIALIZED');
        this.name = 'UtxoContextNotInitializedError';
    }
}

/**
 * Thrown for validation errors.
 */
export class ValidationError extends KaspaError {
    constructor(message, field = null) {
        super(message, 'VALIDATION_ERROR');
        this.name = 'ValidationError';
        this.field = field;
    }
}

/**
 * Thrown when an operation is called on an already disposed/closed resource.
 */
export class DisposedError extends KaspaError {
    constructor(resourceName = 'Resource') {
        super(`${resourceName} has been disposed and cannot be used`, 'DISPOSED');
        this.name = 'DisposedError';
    }
}

/**
 * Thrown when network IDs mismatch.
 */
export class NetworkMismatchError extends KaspaError {
    constructor(expected, actual) {
        super(
            `Network mismatch: expected ${expected}, got ${actual}`,
            'NETWORK_MISMATCH'
        );
        this.name = 'NetworkMismatchError';
        this.expected = expected;
        this.actual = actual;
    }
}
