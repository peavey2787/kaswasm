// BlockScanner.js - Scans incoming blocks for transactions matching a payload filter
// Usage: const scanner = new BlockScanner(eventsInstance); scanner.start(searchText, matchMode, onMatch);

import { hexToString } from './Utilities.js';

/**
 * Match modes for payload filtering.
 */
export const MatchMode = {
    CONTAINS: 'contains',
    PREFIX: 'prefix',
    SUFFIX: 'suffix',
    EXACT: 'exact'
};

/**
 * BlockScanner - Scans incoming blocks for transactions with payloads matching a filter.
 * 
 * Usage:
 *   const scanner = new BlockScanner(eventsInstance);
 *   scanner.start('hello', MatchMode.CONTAINS, (match) => console.log(match));
 *   // later...
 *   scanner.stop();
 */
export class BlockScanner {
    #events = null;
    #isScanning = false;
    #searchText = '';
    #matchMode = MatchMode.CONTAINS;
    #onMatch = null;
    #boundHandler = null;
    #logger = console;
    #wallet = null;

    /**
     * Create a new BlockScanner instance.
     * @param {Events} eventsInstance - The Events instance for block subscriptions
     * @param {Object} [options]
     * @param {Object} [options.logger] - Custom logger (default: console)
     * @param {Object} [options.wallet] - Optional Wallet instance for payload decoding
     */
    constructor(eventsInstance, options = {}) {
        if (!eventsInstance) {
            throw new Error('Events instance is required');
        }
        this.#events = eventsInstance;
        this.#logger = options.logger || console;
        this.#wallet = options.wallet || null;
    }

    /**
     * Check if the scanner is currently running.
     * @returns {boolean}
     */
    get isScanning() {
        return this.#isScanning;
    }

    /**
     * Get the current search text.
     * @returns {string}
     */
    get searchText() {
        return this.#searchText;
    }

    /**
     * Get the current match mode.
     * @returns {string}
     */
    get matchMode() {
        return this.#matchMode;
    }

    /**
     * Decode a transaction payload from hex to UTF-8 string.
     * Prefer Wallet.getPayloadFromTransaction to stay DRY.
     * @param {string} hexPayload - Hex-encoded payload
     * @returns {string} - Decoded string or empty string on failure
     */
    decodePayload(hexPayload) {
        if (!hexPayload || typeof hexPayload !== 'string') return '';

        // Prefer Wallet's decoder when available
        if (this.#wallet && typeof this.#wallet.getPayloadFromTransaction === 'function') {
            try {
                const decoded = this.#wallet.getPayloadFromTransaction({ payload: hexPayload });
                if (decoded != null && decoded !== '') {
                    return decoded;
                }
            } catch (err) {
                this.#logger.warn('[BlockScanner] Wallet payload decode failed, falling back:', err);
            }
        }

        try {
            // Fallback: mirror Wallet.getPayloadFromTransaction logic
            const first = hexToString(hexPayload);
            const isHexLike = /^[0-9a-fA-F]+$/.test(first) && first.length % 2 === 0;
            if (isHexLike) {
                try {
                    return hexToString(first);
                } catch (_) {
                    return first;
                }
            }
            return first;
        } catch {
            return '';
        }
    }

    /**
     * Check if a payload matches the current filter.
     * @param {string} decodedPayload - Decoded payload text
     * @returns {boolean}
     */
    matchesFilter(decodedPayload) {
        if (!this.#searchText) return false;
        if (!decodedPayload) return false;

        const search = this.#searchText;
        const payload = decodedPayload;

        switch (this.#matchMode) {
            case MatchMode.PREFIX:
                return payload.startsWith(search);
            case MatchMode.SUFFIX:
                return payload.endsWith(search);
            case MatchMode.EXACT:
                return payload === search;
            case MatchMode.CONTAINS:
            default:
                return payload.includes(search);
        }
    }

    /**
     * Extract transactions with payloads from a block.
     * @param {Object} block - Block data from getBlock RPC call
     * @returns {Array<{txId: string, payload: string, decodedPayload: string, blockHash: string, blueScore: any}>}
     */
    extractTransactionsWithPayloads(block) {
        const results = [];
        if (!block) return results;

        // Handle nested block structure from getBlock RPC response
        const blockData = block.block || block;
        const blockHash = blockData.hash || blockData.header?.hash || block.hash || null;
        const blueScore = blockData.header?.blueScore ?? block.header?.blueScore ?? null;
        
        // Transactions may be at different levels depending on RPC response format
        const transactions = blockData.transactions || block.transactions || [];
                
        for (const tx of transactions) {
            // Get transaction ID - may be nested
            const txId = tx.verboseData?.transactionId || tx.id || tx.transactionId || null;
            
            // Check for payload at transaction level first (Kaspa standard location)
            // The payload in Kaspa transactions is a hex string at tx.payload
            const txPayloadHex = tx.payload || tx.verboseData?.payload || null;
            
            if (txPayloadHex && typeof txPayloadHex === 'string' && txPayloadHex.length > 0) {
                const decodedPayload = this.decodePayload(txPayloadHex);
                if (decodedPayload) {
                    results.push({
                        txId,
                        payload: txPayloadHex,
                        decodedPayload,
                        blockHash,
                        blueScore,
                        transaction: tx,
                        source: 'tx-level'
                    });                    
                }
            }
        }

        return results;
    }

    /**
     * Handle incoming block and scan for matching payloads.
     * @param {Object} data - Block event data
     */
    #handleBlock(data) {
        const block = data?.block || null;
        if (!block) {
            this.#logger.warn('[BlockScanner] No block in event data');
            return;
        }

        const txsWithPayloads = this.extractTransactionsWithPayloads(block);

        for (const txData of txsWithPayloads) {
            if (this.matchesFilter(txData.decodedPayload)) {
                // Found a match!
                const match = {
                    txId: txData.txId,
                    blockHash: txData.blockHash,
                    blueScore: txData.blueScore,
                    payload: txData.payload,
                    decodedPayload: txData.decodedPayload,
                    matchMode: this.#matchMode,
                    searchText: this.#searchText,
                    timestamp: Date.now(),
                    transaction: txData.transaction
                };                

                if (this.#onMatch) {
                    try {
                        this.#onMatch(match);
                    } catch (err) {
                        this.#logger.error('[BlockScanner] Error in onMatch callback:', err);
                    }
                }
            }
        }
    }

    /**
     * Start scanning incoming blocks for matching payloads.
     * @param {string} searchText - Text to search for in payloads
     * @param {string} matchMode - One of MatchMode values
     * @param {Function} onMatch - Callback when a match is found: (match) => void
     * @returns {Promise<void>}
     */
    async start(searchText, matchMode, onMatch) {
        if (this.#isScanning) {
            return;
        }

        if (!searchText || typeof searchText !== 'string') {
            throw new Error('Search text is required');
        }

        this.#searchText = searchText;
        this.#matchMode = matchMode || MatchMode.CONTAINS;
        this.#onMatch = onMatch;
        this.#boundHandler = this.#handleBlock.bind(this);

        try {
            await this.#events.subscribe('block-added', this.#boundHandler);
            this.#isScanning = true;            
        } catch (err) {
            this.#logger.error('[BlockScanner] Failed to start:', err);
            throw err;
        }
    }

    /**
     * Stop scanning.
     * @returns {Promise<void>}
     */
    async stop() {
        if (!this.#isScanning) {
            return;
        }

        try {
            if (this.#boundHandler) {
                await this.#events.unsubscribe('block-added', this.#boundHandler);
            }
        } catch (err) {
            this.#logger.warn('[BlockScanner] Error unsubscribing:', err);
        }

        this.#isScanning = false;
        this.#boundHandler = null;
    }

    /**
     * Dispose of the scanner.
     */
    async dispose() {
        await this.stop();
        this.#events = null;
        this.#onMatch = null;
    }
}
