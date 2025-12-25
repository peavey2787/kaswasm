// UtxoContext.js - Instance-based UTXO tracking for Kaspa
// Usage: const utxoContext = new UtxoContext(kaspaClient); await utxoContext.watchAddresses([...]);

import { UtxoProcessor, KaspaUtxoContext, ensureWasmInitialized } from './KaspaClient.js';
import { UtxoContextNotInitializedError, DisposedError, NetworkError } from './Errors.js';

/**
 * UtxoContext - Instance-based UTXO tracking manager.
 * 
 * Tracks UTXOs for a set of addresses using a KaspaClient connection.
 * Multiple UtxoContext instances can coexist for different address sets.
 * 
 * Usage:
 *   const client = new KaspaClient();
 *   await client.connect('testnet-10');
 *   
 *   const utxoContext = new UtxoContext(client);
 *   await utxoContext.init();
 *   await utxoContext.watchAddresses(['kaspa:...', 'kaspa:...']);
 *   console.log(utxoContext.balance);
 *   // ...
 *   await utxoContext.dispose();
 */
export class UtxoContext {
    #client = null;
    #processor = null;
    #context = null;
    #initialized = false;
    #disposed = false;
    #eventHandlers = [];
    #logger = console;

    /**
     * Create a new UtxoContext instance.
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
     * Check if this context has been initialized.
     * @returns {boolean}
     */
    get isInitialized() {
        return this.#initialized;
    }

    /**
     * Check if this context has been disposed.
     * @returns {boolean}
     */
    get isDisposed() {
        return this.#disposed;
    }

    /**
     * Get the current balance.
     * @returns {any}
     */
    get balance() {
        this.#assertInitialized();
        return this.#context.balance;
    }

    /**
     * Initialize the UTXO processor and context.
     * @returns {Promise<void>}
     */
    async init() {
        this.#assertNotDisposed();
        
        if (this.#initialized) return;

        this.#assertConnected();
        
        await ensureWasmInitialized();

        try {
            this.#processor = new UtxoProcessor({
                rpc: this.#client.rpc,
                networkId: this.#client.networkId
            });
            await this.#processor.start();
            this.#context = new KaspaUtxoContext({ processor: this.#processor });
            this.#initialized = true;
            this.#logger.log('[UtxoContext] Initialized');
        } catch (err) {
            this.#processor = null;
            this.#context = null;
            throw new UtxoContextNotInitializedError();
        }
    }

    /**
     * Watch (track) addresses for UTXO changes.
     * @param {string[]} addresses - List of addresses to track
     * @returns {Promise<void>}
     */
    async watchAddresses(addresses) {
        this.#assertInitialized();
        return await this.#context.trackAddresses(addresses);
    }

    /**
     * Unregister addresses from tracking.
     * @param {string[]} addresses - List of addresses to untrack
     * @returns {Promise<void>}
     */
    async unregisterAddresses(addresses) {
        this.#assertInitialized();
        return await this.#context.unregisterAddresses(addresses);
    }

    /**
     * Clear all tracked addresses and UTXOs.
     * @returns {Promise<void>}
     */
    async clear() {
        this.#assertInitialized();
        await this.#context.clear();
    }

    /**
     * Stop the UTXO processor.
     * @returns {Promise<void>}
     */
    async stop() {
        if (!this.#processor) return;
        await this.#processor.stop();
        this.#logger.log('[UtxoContext] Stopped');
    }

    /**
     * Start the UTXO processor (if previously stopped).
     * @returns {Promise<void>}
     */
    async start() {
        this.#assertInitialized();
        await this.#processor.start();
        this.#logger.log('[UtxoContext] Started');
    }

    /**
     * Add an event listener to the UTXO processor.
     * @param {Function} callback - Event handler
     */
    addEventListener(callback) {
        this.#assertInitialized();
        this.#processor.addEventListener(callback);
        this.#eventHandlers.push(callback);
    }

    /**
     * Register a handler for common UTXO events with normalized data.
     * @param {Function} handler - Handler receiving normalized event objects
     */
    onUtxoEvents(handler) {
        this.#assertInitialized();

        const wrappedHandler = (event) => {
            switch (event.type) {
                case 'utxo-added':
                    handler({
                        type: 'incoming',
                        txid: event.utxo?.outpoint?.transactionId,
                        index: event.utxo?.outpoint?.index,
                        amount: event.utxo?.amount,
                        payload: event.utxo?.payload
                    });
                    break;
                case 'utxo-spent':
                    handler({
                        type: 'spent',
                        txid: event.utxo?.outpoint?.transactionId,
                        index: event.utxo?.outpoint?.index,
                        amount: event.utxo?.amount
                    });
                    break;
                case 'balance-changed':
                    handler({
                        type: 'balance',
                        balance: event.balance
                    });
                    break;
                default:
                    handler({ type: event.type, raw: event });
            }
        };

        this.addEventListener(wrappedHandler);
    }

    /**
     * Dispose of this context and clean up resources.
     * @returns {Promise<void>}
     */
    async dispose() {
        if (this.#disposed) return;

        try {
            if (this.#context) {
                await this.#context.clear();
            }
        } catch (_) {}

        try {
            if (this.#processor) {
                await this.#processor.stop();
            }
        } catch (_) {}

        this.#processor = null;
        this.#context = null;
        this.#eventHandlers = [];
        this.#initialized = false;
        this.#disposed = true;
        this.#logger.log('[UtxoContext] Disposed');
    }

    #assertNotDisposed() {
        if (this.#disposed) {
            throw new DisposedError('UtxoContext');
        }
    }

    #assertInitialized() {
        this.#assertNotDisposed();
        if (!this.#initialized) {
            throw new UtxoContextNotInitializedError();
        }
    }

    #assertConnected() {
        if (!this.#client.isConnected) {
            throw new NetworkError('KaspaClient is not connected');
        }
    }
}

export default UtxoContext;
