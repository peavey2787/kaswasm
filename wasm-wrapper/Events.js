// Events.js - Instance-based event subscription manager for Kaspa RPC
// Usage: const events = new Events(kaspaClient); await events.subscribe('block-added', handler);

import { EventError, DisposedError, NetworkError } from './Errors.js';

/**
 * Mapping of event names to their RpcClient subscribe/unsubscribe method names.
 */
const EVENT_METHODS = {
    'block-added': {
        subscribe: 'subscribeBlockAdded',
        unsubscribe: 'unsubscribeBlockAdded'
    },
    'virtual-daa-score-changed': {
        subscribe: 'subscribeVirtualDaaScoreChanged',
        unsubscribe: 'unsubscribeVirtualDaaScoreChanged'
    },
    'sink-blue-score-changed': {
        subscribe: 'subscribeSinkBlueScoreChanged',
        unsubscribe: 'unsubscribeSinkBlueScoreChanged'
    },
    'finality-conflict': {
        subscribe: 'subscribeFinalityConflict',
        unsubscribe: 'unsubscribeFinalityConflict'
    },
    'finality-conflict-resolved': {
        subscribe: 'subscribeFinalityConflictResolved',
        unsubscribe: 'unsubscribeFinalityConflictResolved'
    },
    'new-block-template': {
        subscribe: 'subscribeNewBlockTemplate',
        unsubscribe: 'unsubscribeNewBlockTemplate'
    },
    'pruning-point-utxo-set-override': {
        subscribe: 'subscribePruningPointUtxoSetOverride',
        unsubscribe: 'unsubscribePruningPointUtxoSetOverride'
    }
};

/**
 * Events - Instance-based RPC event subscription manager.
 * 
 * Manages event subscriptions through a KaspaClient instance.
 * Multiple Events instances can coexist for different purposes.
 * 
 * Usage:
 *   const client = new KaspaClient();
 *   await client.connect('testnet-10');
 *   
 *   const events = new Events(client);
 *   await events.subscribe('block-added', (data) => console.log(data));
 *   // ...
 *   await events.dispose();
 */
export class Events {
    #client = null;
    #handlers = {};
    #subscriptions = new Set();
    #boundRpcHandler = null;
    #disposed = false;
    #logger = console;

    /**
     * Create a new Events instance.
     * @param {KaspaClient} client - The KaspaClient to use for RPC
     * @param {Object} [options]
     * @param {Object} [options.logger] - Custom logger (default: console)
     */
    constructor(client, options = {}) {
        if (!client) {
            throw new Error('KaspaClient is required');
        }
        this.#client = client;
        this.#logger = options.logger || console;
        this.#boundRpcHandler = this.#handleRpcEvent.bind(this);
    }

    /**
     * Get the underlying KaspaClient.
     * @returns {KaspaClient}
     */
    get client() {
        return this.#client;
    }

    /**
     * Check if this Events instance has been disposed.
     * @returns {boolean}
     */
    get isDisposed() {
        return this.#disposed;
    }

    /**
     * Get list of currently subscribed event types.
     * @returns {string[]}
     */
    get subscribedEvents() {
        return Array.from(this.#subscriptions);
    }

    /**
     * Subscribe to a specific event type.
     * @param {string} eventName - e.g. 'block-added', 'virtual-daa-score-changed'
     * @param {Function} handler - Callback receiving the event data
     * @returns {Promise<void>}
     */
    async subscribe(eventName, handler) {
        this.#assertNotDisposed();
        this.#assertConnected();

        const methods = EVENT_METHODS[eventName];
        if (!methods) {
            throw new EventError(
                `Unknown event type: ${eventName}. Available: ${Object.keys(EVENT_METHODS).join(', ')}`
            );
        }

        // Register handler
        if (!this.#handlers[eventName]) {
            this.#handlers[eventName] = [];
        }
        if (handler && !this.#handlers[eventName].includes(handler)) {
            this.#handlers[eventName].push(handler);
        }

        // Subscribe via RPC if not already subscribed
        if (!this.#subscriptions.has(eventName)) {
            try {
                const rpc = this.#client.rpc;
                rpc.addEventListener(eventName, this.#boundRpcHandler);
                
                const subscribeMethod = methods.subscribe;
                this.#logger.log(`[Events] Subscribing to ${eventName} via ${subscribeMethod}()`);
                await rpc[subscribeMethod]();
                this.#subscriptions.add(eventName);
                this.#logger.log(`[Events] Subscribed to ${eventName}`);
            } catch (err) {
                throw new EventError(`Failed to subscribe to ${eventName}`, err);
            }
        }
    }

    /**
     * Unsubscribe from a specific event type.
     * @param {string} eventName - e.g. 'block-added'
     * @param {Function} [handler] - Specific handler to remove. If omitted, removes all handlers.
     * @returns {Promise<void>}
     */
    async unsubscribe(eventName, handler) {
        if (this.#disposed) return;

        const methods = EVENT_METHODS[eventName];
        if (!methods) {
            throw new EventError(`Unknown event type: ${eventName}`);
        }

        // Remove specific handler or all handlers
        if (handler && this.#handlers[eventName]) {
            this.#handlers[eventName] = this.#handlers[eventName].filter(h => h !== handler);
        } else {
            this.#handlers[eventName] = [];
        }

        // If no handlers left, unsubscribe from RPC
        if (!this.#handlers[eventName] || this.#handlers[eventName].length === 0) {
            if (this.#subscriptions.has(eventName)) {
                try {
                    const rpc = this.#client.rpc;
                    const unsubscribeMethod = methods.unsubscribe;
                    this.#logger.log(`[Events] Unsubscribing from ${eventName}`);
                    await rpc[unsubscribeMethod]();
                    rpc.removeEventListener?.(eventName, this.#boundRpcHandler);
                } catch (err) {
                    this.#logger.warn(`[Events] Unsubscribe error for ${eventName}:`, err);
                }
                this.#subscriptions.delete(eventName);
            }
        }
    }

    /**
     * Subscribe once: receive the next event of this type, then auto-unsubscribe.
     * @param {string} eventName
     * @param {number} [timeout=30000] - Timeout in milliseconds
     * @returns {Promise<any>} Resolves with the event data
     */
    async subscribeOnce(eventName, timeout = 30000) {
        return new Promise((resolve, reject) => {
            let timeoutId = null;
            
            const onceHandler = (data) => {
                if (timeoutId) clearTimeout(timeoutId);
                this.unsubscribe(eventName, onceHandler).catch(() => {});
                resolve(data);
            };

            if (timeout > 0) {
                timeoutId = setTimeout(() => {
                    this.unsubscribe(eventName, onceHandler).catch(() => {});
                    reject(new EventError(`Timeout waiting for ${eventName} event`));
                }, timeout);
            }

            this.subscribe(eventName, onceHandler).catch(reject);
        });
    }

    /**
     * Get the latest block blue score by subscribing once to block-added.
     * @param {number} [timeout=30000]
     * @returns {Promise<bigint>}
     */
    async getLatestBlockBlueScore(timeout = 30000) {
        const eventData = await this.subscribeOnce('block-added', timeout);
        if (eventData?.block?.header?.blueScore !== undefined) {
            return eventData.block.header.blueScore;
        }
        throw new EventError('block-added event did not contain expected blueScore');
    }

    /**
     * Get the current sink blue score.
     * @returns {Promise<bigint>}
     */
    async getSinkBlueScore() {
        this.#assertNotDisposed();
        this.#assertConnected();
        return await this.#client.getSinkBlueScore();
    }

    /**
     * Get a block by hash.
     * @param {string} hash
     * @param {boolean} [includeTransactions=false]
     * @returns {Promise<any>}
     */
    async getBlock(hash, includeTransactions = false) {
        this.#assertNotDisposed();
        this.#assertConnected();
        return await this.#client.getBlock(hash, includeTransactions);
    }

    /**
     * Unsubscribe from all events and clean up.
     * @returns {Promise<void>}
     */
    async dispose() {
        if (this.#disposed) return;

        // Unsubscribe from all events
        for (const eventName of this.#subscriptions) {
            const methods = EVENT_METHODS[eventName];
            if (methods) {
                try {
                    const rpc = this.#client.rpc;
                    await rpc[methods.unsubscribe]();
                    rpc.removeEventListener?.(eventName, this.#boundRpcHandler);
                } catch (_) {}
            }
        }

        this.#subscriptions.clear();
        this.#handlers = {};
        this.#disposed = true;
        this.#logger.log('[Events] Disposed');
    }

    /**
     * Internal handler for RPC events.
     */
    #handleRpcEvent(event) {
        const { type, data } = event || {};
        this.#logger.log(`[Events] Received event: ${type}`);

        const handlers = this.#handlers[type];
        if (handlers && handlers.length > 0) {
            handlers.forEach(handler => {
                try {
                    // Handle both sync and async handlers
                    const result = handler(data);
                    if (result && typeof result.catch === 'function') {
                        result.catch(err => {
                            this.#logger.error(`[Events] Async handler error for ${type}:`, err);
                        });
                    }
                } catch (err) {
                    this.#logger.error(`[Events] Handler error for ${type}:`, err);
                }
            });
        }
    }

    #assertNotDisposed() {
        if (this.#disposed) {
            throw new DisposedError('Events');
        }
    }

    #assertConnected() {
        if (!this.#client.isConnected) {
            throw new NetworkError('KaspaClient is not connected');
        }
    }
}

// Export available event types for reference
export const AVAILABLE_EVENTS = Object.keys(EVENT_METHODS);

export default Events;
