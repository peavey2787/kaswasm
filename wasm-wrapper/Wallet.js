// Wallet.js - Instance-based wallet manager for Kaspa
// Usage: const wallet = new Wallet(kaspaClient); await wallet.create('password');

import {
    KaspaWallet,
    AccountKind,
    kaspaToSompi,
    sompiToKaspaString,
    Address,
    addressFromScriptPublicKey,
    ensureWasmInitialized,
    estimateTransactions
} from './KaspaClient.js';

// Import Mnemonic class directly from the SDK for wallet creation
import { Mnemonic } from '../kas-wasm/kaspa.js';

import {
    stringToHex,
    hexToString,
    validateKaspaAddress,
    validateKaspaAmount,
    validatePriorityFee,
    validatePayload
} from './Utilities.js';

import {
    WalletNotOpenError,
    WalletError,
    InsufficientFundsError,
    InvalidAddressError,
    InvalidAmountError,
    InvalidPayloadError,
    AccountNotFoundError,
    TransactionNotFoundError,
    TransactionError,
    DisposedError,
    NetworkMismatchError,
    ValidationError
} from './Errors.js';

/**
 * Wallet - Instance-based wallet manager.
 * 
 * Manages wallet lifecycle, accounts, transactions, and balance.
 * Multiple Wallet instances can coexist for different wallets/networks.
 * 
 * Usage:
 *   const client = new KaspaClient();
 *   await client.connect('testnet-10');
 *   
 *   const wallet = new Wallet(client);
 *   await wallet.create('mypassword', 'my-wallet');
 *   // ... use wallet
 *   await wallet.close();
 */
export class Wallet {
    #client = null;
    #wallet = null;
    #filename = null;
    #walletSecret = null;
    #mnemonic = null;  // Store mnemonic for retrieval
    #boundEventHandler = null;
    #disposed = false;
    #sendMutex = Promise.resolve();
    #lastEvent = {};
    #eventHandlers = {
        balance: [],
        transaction: [],
        other: []
    };
    #logger = console;

    /**
     * Create a new Wallet instance.
     * @param {KaspaClient} client - The KaspaClient to use
     * @param {Object} [options]
     * @param {Object} [options.logger] - Custom logger (default: console)
     */
    constructor(client, options = {}) {
        if (!client) {
            throw new Error('KaspaClient is required');
        }
        this.#client = client;
        this.#logger = options.logger || console;
    }

    /**
     * Get the underlying KaspaClient.
     * @returns {KaspaClient}
     */
    get client() {
        return this.#client;
    }

    /**
     * Get the current network ID.
     * @returns {string|null}
     */
    get networkId() {
        return this.#client.networkId;
    }

    /**
     * Check if wallet is open.
     * @returns {boolean}
     */
    get isOpen() {
        return this.#wallet !== null;
    }

    /**
     * Check if this wallet has been disposed.
     * @returns {boolean}
     */
    get isDisposed() {
        return this.#disposed;
    }

    /**
     * Get the wallet filename.
     * @returns {string|null}
     */
    get filename() {
        return this.#filename;
    }

    /**
     * Permanently delete a wallet file from browser storage.
     * This is a HARD DELETE - the wallet file will be completely removed from localStorage.
     * 
     * The deletion process:
     * 1. Verifies the password by attempting to open the wallet (authentication)
     * 2. Closes the wallet properly
     * 3. Removes the .wallet file from localStorage
     * 4. Cleans up any related IndexedDB entries
     * 
     * @param {string} filename - The wallet filename to delete
     * @param {string} password - The wallet password (required to authenticate deletion)
     * @param {string} networkId - The network ID the wallet was created on
     * @param {Object} [options]
     * @param {Object} [options.logger] - Custom logger (default: console)
     * @returns {Promise<{ success: boolean, deletedStorageKeys: string[], error?: string }>}
     * @static
     */
    static async deleteWallet(filename, password, networkId, options = {}) {
        const logger = options.logger || console;
        const result = { success: false, deletedStorageKeys: [], error: null };

        if (!filename || !password || !networkId) {
            result.error = 'Filename, password, and networkId are required';
            return result;
        }

        let wallet = null;

        try {
            logger.log(`[Wallet.deleteWallet] Starting hard delete for wallet: ${filename}`);
            await ensureWasmInitialized();

            // Create a temporary wallet instance to verify the wallet exists and password is correct
            wallet = new KaspaWallet({
                resident: false,
                networkId,
                resolver: undefined
            });

            // Check if wallet exists in SDK
            const exists = await wallet.exists(filename);
            if (!exists) {
                logger.log(`[Wallet.deleteWallet] Wallet "${filename}" not found in SDK. Cleaning up localStorage anyway...`);
                // Still try to clean up localStorage in case of orphaned entries
                const cleanedKeys = await Wallet.#cleanupWalletStorage(filename, logger);
                result.deletedStorageKeys = cleanedKeys;
                result.success = true;
                return result;
            }

            // Open the wallet to verify password (authentication step)
            // This validates the password is correct before we delete the file
            logger.log(`[Wallet.deleteWallet] Verifying password by opening wallet...`);
            await wallet.walletOpen({
                walletSecret: password,
                filename,
                accountDescriptors: false
            });

            logger.log(`[Wallet.deleteWallet] Password verified. Proceeding with deletion...`);
            // Note: We don't need to call stop()/disconnect() here because we never called
            // connect()/start() - walletOpen just decrypts and loads the wallet data.
            // The wallet instance will be garbage collected.
            wallet = null;

            // Now remove the wallet file from localStorage and IndexedDB
            logger.log(`[Wallet.deleteWallet] Removing wallet file from browser storage...`);
            const cleanedKeys = await Wallet.#cleanupWalletStorage(filename, logger);
            result.deletedStorageKeys = cleanedKeys;

            if (cleanedKeys.length > 0) {
                logger.log(`[Wallet.deleteWallet] Hard delete completed. Removed ${cleanedKeys.length} storage entries.`);
            } else {
                logger.log(`[Wallet.deleteWallet] No storage entries found to remove. Wallet may have already been deleted.`);
            }
            result.success = true;

        } catch (err) {
            const errMsg = err?.message || String(err);
            logger.error('[Wallet.deleteWallet] Error during wallet deletion:', errMsg);
            result.error = errMsg;
            result.success = false;
        }
        // Note: No finally cleanup needed - we never called connect()/start()
        // so there's nothing to stop/disconnect. The wallet instance will be GC'd.

        return result;
    }

    /**
     * Clean up wallet storage entries from localStorage and IndexedDB.
     * The Kaspa SDK stores wallet data in localStorage with keys like:
     * - `${filename}.wallet` - main wallet file
     * - Other potential keys with the filename prefix
     * 
     * @param {string} filename - The wallet filename
     * @param {Object} logger - Logger instance
     * @returns {Promise<string[]>} - List of deleted storage keys
     * @private
     * @static
     */
    static async #cleanupWalletStorage(filename, logger) {
        const deletedKeys = [];

        // Common patterns the Kaspa SDK uses for wallet storage in localStorage
        const possibleKeys = [
            `${filename}.wallet`,           // Primary wallet file
            `${filename}`,                  // Without suffix
            `kaspa_${filename}`,            // With kaspa prefix
            `kaspa_${filename}.wallet`,     // With kaspa prefix and suffix
        ];

        // Remove from localStorage
        for (const key of possibleKeys) {
            try {
                if (localStorage.getItem(key) !== null) {
                    localStorage.removeItem(key);
                    deletedKeys.push(`localStorage:${key}`);
                    logger.log(`[Wallet.deleteWallet] Removed localStorage key: ${key}`);
                }
            } catch (e) {
                logger.warn(`[Wallet.deleteWallet] Failed to remove localStorage key ${key}:`, e);
            }
        }

        // Also scan for any keys containing the filename (in case of variations)
        try {
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && (key.includes(filename) && key.endsWith('.wallet'))) {
                    keysToRemove.push(key);
                }
            }
            for (const key of keysToRemove) {
                localStorage.removeItem(key);
                deletedKeys.push(`localStorage:${key}`);
                logger.log(`[Wallet.deleteWallet] Removed localStorage key (scan): ${key}`);
            }
        } catch (e) {
            logger.warn('[Wallet.deleteWallet] Error scanning localStorage:', e);
        }

        // Try to clean up IndexedDB entries related to this wallet
        // The SDK may store transaction data in IndexedDB
        try {
            const dbNames = [
                `kaspa_${filename}`,
                `kaspa-wallet-${filename}`,
                filename,
            ];

            for (const dbName of dbNames) {
                try {
                    const deleteRequest = indexedDB.deleteDatabase(dbName);
                    await new Promise((resolve, reject) => {
                        deleteRequest.onsuccess = () => {
                            deletedKeys.push(`indexedDB:${dbName}`);
                            logger.log(`[Wallet.deleteWallet] Deleted IndexedDB database: ${dbName}`);
                            resolve();
                        };
                        deleteRequest.onerror = () => {
                            // Database might not exist, that's OK
                            resolve();
                        };
                        deleteRequest.onblocked = () => {
                            logger.warn(`[Wallet.deleteWallet] IndexedDB deletion blocked for: ${dbName}`);
                            resolve();
                        };
                    });
                } catch (e) {
                    // Ignore - database might not exist
                }
            }
        } catch (e) {
            logger.warn('[Wallet.deleteWallet] Error cleaning IndexedDB:', e);
        }

        return deletedKeys;
    }

    /**
     * Check if a wallet file exists.
     * @param {string} filename - The wallet filename to check
     * @param {string} networkId - The network ID
     * @returns {Promise<boolean>}
     * @static
     */
    static async walletExists(filename, networkId) {
        if (!filename || !networkId) {
            return false;
        }

        try {
            await ensureWasmInitialized();

            const wallet = new KaspaWallet({
                resident: false,
                networkId,
                resolver: undefined
            });

            const exists = await wallet.exists(filename);
            return exists;
        } catch (err) {
            console.warn('[Wallet.walletExists] Error checking wallet existence:', err);
            return false;
        }
    }

    /**
     * Validate a mnemonic phrase.
     * @param {string} mnemonic - The mnemonic phrase to validate
     * @returns {{ valid: boolean, error?: string, wordCount?: number }}
     * @static
     */
    static validateMnemonic(mnemonic) {
        if (!mnemonic || typeof mnemonic !== 'string') {
            return { valid: false, error: 'Mnemonic is required' };
        }

        const words = mnemonic.trim().toLowerCase().split(/\s+/);
        const wordCount = words.length;

        // Standard BIP-39 word counts
        if (![12, 15, 18, 21, 24].includes(wordCount)) {
            return { 
                valid: false, 
                error: `Invalid word count: ${wordCount}. Expected 12, 15, 18, 21, or 24 words.`,
                wordCount 
            };
        }

        // Try to validate using SDK's Mnemonic class
        try {
            new Mnemonic(mnemonic.trim().toLowerCase());
            return { valid: true, wordCount };
        } catch (err) {
            return { 
                valid: false, 
                error: err.message || 'Invalid mnemonic phrase',
                wordCount 
            };
        }
    }

    /**
     * Import a wallet from a mnemonic phrase.
     * Creates a new wallet file with the provided mnemonic.
     * @param {string} password - Wallet password
     * @param {string} mnemonic - The mnemonic phrase (12, 15, 18, 21, or 24 words)
     * @param {string} [filename='imported-wallet'] - Wallet filename
     * @returns {Promise<boolean>}
     */
    async import(password, mnemonic, filename = 'imported-wallet') {
        this.#assertNotDisposed();

        if (!password) {
            throw new ValidationError('Password is required', 'password');
        }

        if (!mnemonic) {
            throw new ValidationError('Mnemonic is required', 'mnemonic');
        }

        // Validate mnemonic
        const validation = Wallet.validateMnemonic(mnemonic);
        if (!validation.valid) {
            throw new ValidationError(validation.error, 'mnemonic');
        }

        // Normalize mnemonic
        const normalizedMnemonic = mnemonic.trim().toLowerCase();

        try {
            this.#logger.log('[Wallet] Importing wallet from mnemonic...');
            await ensureWasmInitialized();

            // Cleanup existing wallet if re-importing
            await this.#cleanup();

            this.#filename = filename;
            this.#walletSecret = password;
            this.#mnemonic = normalizedMnemonic;

            const networkId = this.#client.networkId;

            this.#wallet = new KaspaWallet({
                resident: false,
                networkId,
                resolver: this.#client.resolver || undefined
            });

            // Check if wallet file already exists
            const exists = await this.#wallet.exists(filename);
            if (exists) {
                throw new WalletError(`Wallet "${filename}" already exists. Choose a different name or delete the existing wallet.`);
            }

            this.#logger.log('[Wallet] Creating wallet with imported mnemonic...');

            // Create wallet with the provided mnemonic
            await this.#wallet.walletCreate({
                walletSecret: password,
                filename,
                title: 'Imported',
                mnemonic: normalizedMnemonic
            });

            this.#logger.log('[Wallet] Wallet created, opening...');

            await this.#wallet.walletOpen({
                walletSecret: password,
                filename,
                accountDescriptors: true
            });

            await this.#wallet.accountsEnsureDefault({
                walletSecret: password,
                type: new AccountKind('bip32')
            });

            this.#boundEventHandler = this.#handleEvent.bind(this);
            this.#wallet.addEventListener(this.#boundEventHandler);

            await this.#wallet.connect();
            await this.#wallet.start();

            this.#logger.log('[Wallet] Import complete. Wallet ready.');
            return true;
        } catch (err) {
            this.#logger.error('[Wallet] Import error:', err);
            if (err instanceof WalletError || err instanceof ValidationError) {
                throw err;
            }
            throw new WalletError('Failed to import wallet', err);
        }
    }

    /**
     * Create or open a wallet.
     * @param {string} password - Wallet password
     * @param {string} [filename='wallet-browser-demo'] - Wallet filename
     * @returns {Promise<boolean>}
     */
    async create(password, filename = 'wallet-browser-demo') {
        this.#assertNotDisposed();
        
        if (!password) {
            throw new ValidationError('Password is required', 'password');
        }

        try {
            this.#logger.log('[Wallet] Initializing...');
            await ensureWasmInitialized();

            // Cleanup existing wallet if re-creating
            await this.#cleanup();

            this.#filename = filename;
            this.#walletSecret = password;

            const networkId = this.#client.networkId;

            this.#wallet = new KaspaWallet({
                resident: false,
                networkId,
                resolver: this.#client.resolver || undefined
            });

            const exists = await this.#wallet.exists(filename);
            if (!exists) {
                this.#logger.log('[Wallet] Creating new wallet...');
                
                // Generate mnemonic ourselves so we can store it
                const mnemonic = Mnemonic.random();
                this.#mnemonic = mnemonic.phrase;
                
                await this.#wallet.walletCreate({
                    walletSecret: password,
                    filename,
                    title: 'W-1',
                    mnemonic: mnemonic.phrase
                });
                
                this.#logger.log('[Wallet] New wallet created with mnemonic stored.');
            } else {
                // For existing wallets, we cannot retrieve the mnemonic
                // User should have saved it when wallet was created
                this.#mnemonic = null;
            }

            await this.#wallet.walletOpen({
                walletSecret: password,
                filename,
                accountDescriptors: true
            });

            await this.#wallet.accountsEnsureDefault({
                walletSecret: password,
                type: new AccountKind('bip32')
            });

            this.#boundEventHandler = this.#handleEvent.bind(this);
            this.#wallet.addEventListener(this.#boundEventHandler);

            await this.#wallet.connect();
            await this.#wallet.start();

            this.#logger.log('[Wallet] Ready.');
            return true;
        } catch (err) {
            this.#logger.error('[Wallet] Create error:', err);
            if (err instanceof WalletError || err instanceof NetworkMismatchError) {
                throw err;
            }
            throw new WalletError('Failed to create/open wallet', err);
        }
    }

    /**
     * Open an existing wallet.
     * @param {string} filename - Wallet filename
     * @param {string} password - Wallet password
     * @returns {Promise<boolean>}
     */
    async open(filename, password) {
        this.#assertNotDisposed();

        if (!filename || !password) {
            throw new ValidationError('Filename and password are required');
        }

        try {
            this.#logger.log('[Wallet] Opening wallet...');
            await ensureWasmInitialized();

            await this.#cleanup();

            this.#filename = filename;
            this.#walletSecret = password;

            const networkId = this.#client.networkId;

            this.#wallet = new KaspaWallet({
                resident: false,
                networkId,
                resolver: this.#client.resolver || undefined
            });

            await this.#wallet.walletOpen({
                walletSecret: password,
                filename,
                accountDescriptors: true
            });

            this.#boundEventHandler = this.#handleEvent.bind(this);
            this.#wallet.addEventListener(this.#boundEventHandler);

            await this.#wallet.connect();
            await this.#wallet.start();

            this.#logger.log('[Wallet] Wallet opened and started.');
            return true;
        } catch (err) {
            this.#logger.error('[Wallet] Open error:', err);
            if (err instanceof WalletError || err instanceof NetworkMismatchError) {
                throw err;
            }
            throw new WalletError('Failed to open wallet', err);
        }
    }

    /**
     * Change the wallet password (secret).
     * Requires the current wallet to be open and the old password provided.
     * @param {string} oldPassword - Existing wallet password
     * @param {string} newPassword - New wallet password
     * @returns {Promise<boolean>}
     */
    async changePassword(oldPassword, newPassword) {
        this.#assertNotDisposed();

        if (!this.#wallet) {
            throw new WalletNotOpenError();
        }
        if (!oldPassword || !newPassword) {
            throw new ValidationError('Old and new passwords are required', 'password');
        }

        try {
            this.#logger.log('[Wallet] Changing wallet password...');
            await this.#wallet.walletChangeSecret({
                oldWalletSecret: oldPassword,
                newWalletSecret: newPassword
            });
            this.#walletSecret = newPassword;
            this.#logger.log('[Wallet] Password changed successfully.');
            return true;
        } catch (err) {
            this.#logger.error('[Wallet] Change password error:', err);
            if (err instanceof WalletError || err instanceof NetworkMismatchError) {
                throw err;
            }
            throw new WalletError('Failed to change wallet password', err);
        }
    }

    /**
     * Close the wallet and clean up resources.
     * @returns {Promise<void>}
     */
    async close() {
        // Wait for in-flight operations
        try {
            await this.#sendMutex;
        } catch (_) {}

        await this.#cleanup();
        this.#logger.log('[Wallet] Closed');
    }

    /**
     * Dispose of this wallet permanently.
     * @returns {Promise<void>}
     */
    async dispose() {
        if (this.#disposed) return;
        
        await this.close();
        this.#disposed = true;
        this.#eventHandlers = { balance: [], transaction: [], other: [] };
        this.#logger.log('[Wallet] Disposed');
    }

    /**
     * Estimate the transaction fee for a send operation.
     * Uses the SDK's Generator to calculate accurate mass and fees based on actual UTXOs.
     * @param {Object} params
     * @param {string} params.amount - Amount in KAS to send
     * @param {string} params.toAddress - Destination address
     * @param {string} [params.payload] - Optional payload (hex string or UTF-8 text)
     * @param {string} [params.priorityFeeKas] - Optional priority fee in KAS (extra on top of base fee)
     * @returns {Promise<{ mass: bigint, fees: bigint, feesKas: string, priorityFee: bigint, baseFee: bigint }>}
     */
    async estimateTransactionFee({ amount, toAddress, payload, priorityFeeKas }) {
        this.#assertOpen();

        // Validate inputs
        if (!validateKaspaAddress(Address, toAddress)) {
            throw new InvalidAddressError(toAddress);
        }
        if (!validateKaspaAmount(amount)) {
            throw new InvalidAmountError(amount, 'Amount must be >= MIN_KAS_AMOUNT');
        }

        // Get account info
        const accounts = await this.#wallet.accountsEnumerate({});
        if (!accounts.accountDescriptors?.length) {
            throw new AccountNotFoundError();
        }
        const firstAccount = accounts.accountDescriptors[0];
        const changeAddress = firstAccount.changeAddress;
        const receiveAddress = firstAccount.receiveAddress;

        // Get UTXOs for the account addresses
        const addresses = [receiveAddress, changeAddress].filter(Boolean);
        const utxoResult = await this.#client.getUtxosByAddresses(addresses);
        
        // Extract UTXO entries from the result
        let utxoEntries = [];
        if (utxoResult && Array.isArray(utxoResult)) {
            utxoEntries = utxoResult;
        } else if (utxoResult && utxoResult.entries) {
            utxoEntries = utxoResult.entries;
        }

        if (!utxoEntries.length) {
            throw new InsufficientFundsError('0', '0');
        }

        // Build output
        const outputs = [{
            address: toAddress,
            amount: kaspaToSompi(amount)
        }];

        // Priority fee (extra on top of base network fee)
        let priorityFee = 0n;
        if (priorityFeeKas != null && priorityFeeKas !== '') {
            if (!validatePriorityFee(priorityFeeKas)) {
                throw new ValidationError('Invalid priority fee', 'priorityFeeKas');
            }
            priorityFee = kaspaToSompi(priorityFeeKas);
        }

        // Prepare payload if provided
        let payloadHex = undefined;
        if (payload) {
            // Check if it's already hex or needs conversion
            if (/^[0-9a-fA-F]*$/.test(payload) && payload.length % 2 === 0) {
                payloadHex = payload;
            } else {
                // Convert UTF-8 to hex
                payloadHex = stringToHex(payload);
            }
        }

        // Use SDK's estimateTransactions for accurate mass/fee calculation
        // Generator expects `entries` and `networkId` in the settings object
        const settings = {
            entries: utxoEntries,
            outputs,
            changeAddress,
            priorityFee,
            payload: payloadHex,
            networkId: this.networkId
        };

        const estimate = await estimateTransactions(settings);

        // estimate contains: { mass, fees, ... } from GeneratorSummary
        const totalFees = estimate.fees ?? 0n;
        const mass = estimate.mass ?? 0n;
        const baseFee = totalFees - priorityFee;

        return {
            mass,
            fees: totalFees,
            feesKas: sompiToKaspaString(totalFees),
            priorityFee,
            baseFee
        };
    }

    /**
    * Send KAS to an address.
    * @param {Object} params
    * @param {string} params.amount - Amount in KAS
    * @param {string} params.toAddress - Destination address
    * @param {string} [params.payload] - Optional payload
    * @param {string} [params.priorityFeeKas] - Optional custom priority fee in KAS
    * @returns {Promise<any>}
    */
    async send({ amount, toAddress, payload, priorityFeeKas }) {
        return this.#withSendLock(async () => {
            this.#assertOpen();

            // Validate address
            if (!validateKaspaAddress(Address, toAddress)) {
                throw new InvalidAddressError(toAddress);
            }

            // Validate amount
            if (!validateKaspaAmount(amount)) {
                throw new InvalidAmountError(amount, 'Amount must be >= MIN_KAS_AMOUNT');
            }

            // Get account
            const accounts = await this.#wallet.accountsEnumerate({});
            if (!accounts.accountDescriptors?.length) {
                throw new AccountNotFoundError();
            }
            const firstAccount = accounts.accountDescriptors[0];

            // Determine priority fee:
            // - If custom fee provided: use it as extra priority fee on top of base network fee
            // - If no custom fee: use 0 (dust-floor / minimum required by network based on mass)
            let priorityFeeSompi = 0n;
            if (priorityFeeKas != null && priorityFeeKas !== '') {
                if (!validatePriorityFee(priorityFeeKas)) {
                    throw new ValidationError('Invalid priority fee', 'priorityFeeKas');
                }
                priorityFeeSompi = kaspaToSompi(priorityFeeKas);
            }

            // Check balance (use amount + priority fee; network will add base fee from mass)
            const spendable = await this.getSpendableBalance(firstAccount.accountId);
            const required = kaspaToSompi(amount) + priorityFeeSompi;
            if (spendable < required) {
                throw new InsufficientFundsError(required.toString(), spendable.toString());
            }

            // Build request - priorityFeeSompi is extra fee on top of the base network fee
            const sendRequest = {
                walletSecret: this.#walletSecret,
                accountId: firstAccount.accountId,
                priorityFeeSompi,
                destination: [{
                    address: toAddress,
                    amount: kaspaToSompi(amount)
                }]
            };

            // Payload
            if (payload) {
                if (!validatePayload(payload)) {
                    throw new InvalidPayloadError('Payload must be a string and <= 32KB');
                }
                const hex = stringToHex(payload);
                if (hex.length % 2 !== 0) {
                    throw new InvalidPayloadError('Invalid hex payload');
                }
                if (hex.length / 2 > 32 * 1024) {
                    throw new InvalidPayloadError('Payload too large');
                }
                sendRequest.payload = hex;
            }

            try {
                return await this.#wallet.accountsSend(sendRequest);
            } catch (err) {
                throw new TransactionError('Transaction failed', err);
            }
        });
    }

    /**
     * Transfer KAS between accounts.
     * @param {Object} params
     * @param {string} params.amount - Amount in KAS
     * @param {string} params.fromAccountId - Source account ID
     * @param {string} params.toAccountId - Destination account ID
     * @param {string} [params.payload] - Optional payload
     * @returns {Promise<any>}
     */
    async transfer({ amount, fromAccountId, toAccountId, payload }) {
        return this.#withSendLock(async () => {
            this.#assertOpen();

            if (!fromAccountId || typeof fromAccountId !== 'string') {
                throw new ValidationError('Invalid fromAccountId', 'fromAccountId');
            }
            if (!toAccountId || typeof toAccountId !== 'string') {
                throw new ValidationError('Invalid toAccountId', 'toAccountId');
            }

            if (!validateKaspaAmount(amount)) {
                throw new InvalidAmountError(amount, 'Amount must be >= MIN_KAS_AMOUNT');
            }

            const spendable = await this.getSpendableBalance(fromAccountId);

            // Use dust-floor (0) for transfer - SDK handles the base network fee
            const required = kaspaToSompi(amount);
            if (spendable < required) {
                throw new InsufficientFundsError(required.toString(), spendable.toString());
            }

            const transferRequest = {
                walletSecret: this.#walletSecret,
                sourceAccountId: fromAccountId,
                destinationAccountId: toAccountId,
                transferAmountSompi: kaspaToSompi(amount)
            };

            if (payload) {
                if (!validatePayload(payload)) {
                    throw new InvalidPayloadError('Payload must be a string and <= 32KB');
                }
                const hex = stringToHex(payload);
                if (hex.length % 2 !== 0) {
                    throw new InvalidPayloadError('Invalid hex payload');
                }
                if (hex.length / 2 > 32 * 1024) {
                    throw new InvalidPayloadError('Payload too large');
                }
                transferRequest.payload = hex;
            }

            try {
                return await this.#wallet.accountsTransfer(transferRequest);
            } catch (err) {
                throw new TransactionError('Transfer failed', err);
            }
        });
    }

    /**
     * Activate accounts.
     * @param {Object} params
     * @param {string[]} params.accountIds - Account IDs to activate
     * @returns {Promise<any>}
     */
    async accountsActivate({ accountIds }) {
        this.#assertOpen();
        return await this.#wallet.accountsActivate({ accountIds });
    }

    /**
     * Create a new address for an account.
     * By default this will create a new receive address.
     * @param {Object} params
     * @param {string} params.accountId - Account ID to create address for
     * @param {string} [params.addressKind] - Optional address kind (string or NewAddressKind)
     * @returns {Promise<string>} The new address as a string
     */
    async createNewAddress({ accountId, addressKind } = {}) {
        this.#assertOpen();

        if (!accountId || typeof accountId !== 'string') {
            throw new ValidationError('Invalid accountId', 'accountId');
        }

        const request = { accountId };
        if (addressKind != null) {
            request.addressKind = addressKind;
        }

        let res;
        try {
            res = await this.#wallet.accountsCreateNewAddress(request);
        } catch (err) {
            throw new WalletError('Failed to create new address', err);
        }

        const addr = res && res.address;
        if (!addr) {
            throw new WalletError('Wallet returned no address for createNewAddress');
        }

        return typeof addr.toString === 'function' ? addr.toString() : String(addr);
    }

    /**
     * List all accounts.
     * @returns {Promise<any>}
     */
    async listAccounts() {
        this.#assertOpen();
        return await this.#wallet.accountsEnumerate({});
    }

    /**
     * Get the wallet's mnemonic phrase.
     * WARNING: This exposes sensitive data. Handle with care.
     * NOTE: Only available for wallets created in this session. 
     *       For existing wallets, returns null (mnemonic cannot be retrieved from SDK).
     * @returns {Promise<string|null>} The mnemonic phrase or null if not available
     */
    async getMnemonic() {
        this.#assertOpen();

        // Return stored mnemonic if available (only for newly created wallets)
        if (this.#mnemonic) {
            return this.#mnemonic;
        }

        // For existing wallets, the mnemonic cannot be retrieved from the SDK
        // The user should have saved it when the wallet was first created
        return null;
    }

    /**
     * Activate all accounts in the wallet.
     * This ensures all accounts appear in enumeration.
     * @returns {Promise<void>}
     */
    async activateAllAccounts() {
        this.#assertOpen();

        // Get all account descriptors
        const res = await this.#wallet.accountsEnumerate({});
        const descriptors = res?.accountDescriptors || [];

        if (descriptors.length === 0) {
            return;
        }

        // Collect all account IDs and activate them
        const accountIds = descriptors
            .map(desc => desc.accountId || desc.account_id)
            .filter(Boolean);

        if (accountIds.length > 0) {
            try {
                await this.#wallet.accountsActivate({ accountIds });
                this.#logger.log(`[Wallet] Activated ${accountIds.length} account(s)`);
            } catch (err) {
                this.#logger.warn('[Wallet] Failed to activate accounts:', err);
            }
        }
    }

    /**
     * List all known addresses for all accounts.
     * Flattens receive/change/other addresses from account descriptors.
     * This will activate all accounts first to ensure they are all returned.
     * @returns {Promise<{ accountId: string, receiveAddress?: string, changeAddress?: string, allAddresses: string[] }[]>}
     */
    async listAllAddresses() {
        this.#assertOpen();

        // First, activate all accounts to ensure they appear in enumeration
        await this.activateAllAccounts();

        const res = await this.#wallet.accountsEnumerate({});
        const descriptors = res?.accountDescriptors || [];

        return descriptors.map(desc => {
            // Helper to convert address object to string
            const addressToString = (addr) => {
                if (!addr) return null;
                if (typeof addr === 'string') return addr;
                if (typeof addr.toString === 'function' && addr.toString() !== '[object Object]') {
                    return addr.toString();
                }
                // Handle {prefix, payload} format
                if (addr.prefix && addr.payload) {
                    return `${addr.prefix}:${addr.payload}`;
                }
                return null;
            };

            const receiveAddress = addressToString(desc.receiveAddress || desc.receive_address);
            const changeAddress = addressToString(desc.changeAddress || desc.change_address);

            const addresses = new Set();
            if (receiveAddress) addresses.add(receiveAddress);
            if (changeAddress) addresses.add(changeAddress);

            // Parse the addresses array which can be nested arrays of address objects
            if (Array.isArray(desc.addresses)) {
                const flattenAndAdd = (arr) => {
                    for (const item of arr) {
                        if (Array.isArray(item)) {
                            flattenAndAdd(item);
                        } else {
                            const addrStr = addressToString(item);
                            if (addrStr) addresses.add(addrStr);
                        }
                    }
                };
                flattenAndAdd(desc.addresses);
            }

            return {
                accountId: desc.accountId || desc.account_id || '',
                receiveAddress,
                changeAddress,
                allAddresses: Array.from(addresses)
            };
        });
    }

    /**
     * List transactions for an account.
     * @param {string} accountId
     * @param {Object} [options]
     * @param {number} [options.start=0]
     * @param {number} [options.end=20]
     * @returns {Promise<any>}
     */
    async listTransactions(accountId, { start = 0, end = 20 } = {}) {
        this.#assertOpen();
        return await this.#wallet.transactionsDataGet({
            accountId,
            start,
            end,
            networkId: this.networkId
        });
    }

    /**
     * Extract and decode a payload from a transaction.
     * @param {any} transaction
     * @returns {string|null}
     */
    getPayloadFromTransaction(transaction) {
        if (!transaction || typeof transaction !== 'object') return null;

        const hex = transaction.payload
            || transaction.data?.payload
            || transaction.metadata?.payload
            || transaction.data?.data?.transaction?.payload;

        if (!hex || typeof hex !== 'string' || !hex.length) {
            return null;
        }

        try {
            const first = hexToString(hex);
            const isHexLike = /^[0-9a-fA-F]+$/.test(first) && first.length % 2 === 0;
            if (isHexLike) {
                try {
                    return hexToString(first);
                } catch (_) {
                    return first;
                }
            }
            return first;
        } catch (err) {
            this.#logger.warn('[Wallet] Failed to decode payload:', err);
            return null;
        }
    }

    /**
     * Convert script public key to address.
     * @param {string|object} scriptPubKey
     * @returns {string}
     */
    scriptPubKeyToAddress(scriptPubKey) {
        if (!scriptPubKey) {
            throw new ValidationError('scriptPubKey is required', 'scriptPubKey');
        }

        const addr = addressFromScriptPublicKey(scriptPubKey, this.networkId);
        if (!addr) {
            throw new Error('Unable to derive address from script public key');
        }
        return addr.toString();
    }

    /**
     * Get UTXOs for addresses.
     * @param {string|string[]} addresses
     * @returns {Promise<any>}
     */
    async getUtxosByAddresses(addresses) {
        this.#assertNotDisposed();

        let list = [];
        if (typeof addresses === 'string') {
            list = addresses.split(/[\s,]+/).map(a => a.trim()).filter(a => a.length > 0);
        } else if (Array.isArray(addresses)) {
            list = addresses.map(a => typeof a === 'string' ? a.trim() : a).filter(a => typeof a === 'string' && a.length > 0);
        } else {
            throw new ValidationError('addresses must be a string or array of strings', 'addresses');
        }

        if (!list.length) {
            throw new ValidationError('At least one address is required', 'addresses');
        }

        for (const addr of list) {
            if (!validateKaspaAddress(Address, addr)) {
                throw new InvalidAddressError(addr);
            }
        }

        return await this.#client.getUtxosByAddresses(list);
    }

    /**
     * Get spendable balance for an account.
     * @param {string} accountId
     * @returns {Promise<number>}
     */
    async getSpendableBalance(accountId) {
        this.#assertOpen();

        const res = await this.#wallet.accountsGet({ accountId });
        if (!res) return Number.MAX_SAFE_INTEGER;

        let bal = null;
        if (res.account?.balance) {
            bal = res.account.balance;
        } else if (res.accounts?.[0]?.balance) {
            bal = res.accounts[0].balance;
        }

        if (!bal) {
            return Number.MAX_SAFE_INTEGER;
        }

        return Number(bal.mature || 0) + Number(bal.pending || 0);
    }

    /**
     * Clear all event handlers.
     */
    clearEventHandlers() {
        this.#eventHandlers = { balance: [], transaction: [], other: [] };
    }

    /**
     * Register a balance change handler.
     * @param {Function} handler
     */
    onBalanceChanged(handler) {
        this.#eventHandlers.balance.push(handler);
    }

    /**
     * Register a transaction handler.
     * @param {Function} handler
     */
    onTransactionReceived(handler) {
        this.#eventHandlers.transaction.push(handler);
    }

    /**
     * Register a handler for other events.
     * @param {Function} handler
     */
    onOtherEvent(handler) {
        this.#eventHandlers.other.push(handler);
    }

    async #cleanup() {
        if (!this.#wallet) return;

        if (this.#boundEventHandler) {
            try {
                this.#wallet.removeEventListener(this.#boundEventHandler);
            } catch (_) {}
        }

        try {
            await this.#wallet.stop();
        } catch (_) {}

        try {
            await this.#wallet.disconnect();
        } catch (_) {}

        this.#wallet = null;
        this.#boundEventHandler = null;
        this.#filename = null;
        this.#walletSecret = null;
        this.#mnemonic = null;  // Clear mnemonic on cleanup
    }

    async #withSendLock(fn) {
        const prev = this.#sendMutex;
        let release;
        this.#sendMutex = new Promise(res => (release = res));
        try {
            await prev;
        } catch (_) {}
        try {
            return await fn();
        } finally {
            release();
        }
    }

    #handleEvent({ type, data }) {
        const eventKey = type + ':' + (data?.id || data?.unixtimeMsec || '');
        const now = Date.now();

        // Prune old events
        const PRUNE_AGE = 10 * 60 * 1000;
        for (const key in this.#lastEvent) {
            if (now - this.#lastEvent[key] > PRUNE_AGE) delete this.#lastEvent[key];
        }

        // Dedupe
        if (this.#lastEvent[eventKey] && now - this.#lastEvent[eventKey] < 1000) {
            return;
        }
        this.#lastEvent[eventKey] = now;

        if (type === 'balance') {
            this.#eventHandlers.balance.forEach(fn => fn(data));
        } else if (['maturity', 'pending', 'discovery', 'transfer-incoming', 'incoming', 'external'].includes(type)) {
            this.#eventHandlers.transaction.forEach(fn => fn(data));
        } else {
            this.#eventHandlers.other.forEach(fn => fn(type, data));
        }
    }

    #assertNotDisposed() {
        if (this.#disposed) {
            throw new DisposedError('Wallet');
        }
    }

    #assertOpen() {
        this.#assertNotDisposed();
        if (!this.#wallet) {
            throw new WalletNotOpenError();
        }
    }
}

export default Wallet;