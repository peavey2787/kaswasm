// KaspaClient.js - Centralized infrastructure for WASM, RPC, and network lifecycle
// Usage: const client = new KaspaClient(); await client.connect('testnet-10');

import initKaspa, {
    Resolver,
    RpcClient,
    Wallet as KaspaWallet,
    AccountKind,
    UtxoProcessor,
    UtxoContext as KaspaUtxoContext,
    kaspaToSompi,
    sompiToKaspaString,
    setDefaultStorageFolder,
    Address,
    addressFromScriptPublicKey,
    estimateTransactions
} from '../kas-wasm/kaspa.js';

import { NETWORK_IDS } from './Constants.js';
import { WasmInitError, NetworkError, RpcError, DisposedError } from './Errors.js';

// Shared WASM initialization state (module-level, but not mutable after init)
let wasmInitialized = false;
let wasmInitPromise = null;

/**
 * Initialize the Kaspa WASM module. Safe to call multiple times.
 * @returns {Promise<void>}
 */
async function ensureWasmInitialized() {
    if (wasmInitialized) return;
    
    if (!wasmInitPromise) {
        wasmInitPromise = (async () => {
            try {
                await initKaspa();
                wasmInitialized = true;
            } catch (err) {
                wasmInitPromise = null;
                throw new WasmInitError('Failed to initialize Kaspa WASM', err);
            }
        })();
    }
    
    await wasmInitPromise;
}

/**
 * KaspaClient - Central infrastructure object for Kaspa SDK operations.
 * 
 * Manages:
 * - WASM initialization
 * - RPC connection lifecycle
 * - Network configuration
 * - Shared resources
 * 
 * Usage:
 *   const client = new KaspaClient();
 *   await client.connect('testnet-10');
 *   // ... use client.rpc, client.networkId, etc.
 *   await client.disconnect();
 */
export class KaspaClient {
    #networkId = null;
    #rpc = null;
    #resolver = null;
    #disposed = false;
    #connectionPromise = null;
    #eventListeners = new Map();
    #logger = console;

    /**
     * Create a new KaspaClient instance.
     * @param {Object} [options]
     * @param {Object} [options.logger] - Custom logger (default: console)
     */
    constructor(options = {}) {
        this.#logger = options.logger || console;
    }

    /**
     * Get the current network ID.
     * @returns {string|null}
     */
    get networkId() {
        return this.#networkId;
    }

    /**
     * Get the underlying Resolver instance, if connected.
     * @returns {Resolver|null}
     */
    get resolver() {
        return this.#resolver;
    }

    /**
     * Get the RPC client. Throws if not connected.
     * @returns {RpcClient}
     */
    get rpc() {
        this.#assertNotDisposed();
        if (!this.#rpc) {
            throw new NetworkError('Not connected. Call connect() first.');
        }
        return this.#rpc;
    }

    /**
     * Check if currently connected.
     * @returns {boolean}
     */
    get isConnected() {
        return this.#rpc?.isConnected ?? false;
    }

    /**
     * Check if this client has been disposed.
     * @returns {boolean}
     */
    get isDisposed() {
        return this.#disposed;
    }

    /**
     * Initialize WASM and connect to a network.
     * @param {string} networkId - Network to connect to
     * @returns {Promise<void>}
     */
    async connect(networkId = NETWORK_IDS.TESTNET_10) {
        this.#assertNotDisposed();

        // If already connecting, wait for that
        if (this.#connectionPromise) {
            await this.#connectionPromise;
            if (this.#networkId === networkId) return;
        }

        // If already connected to different network, disconnect first
        if (this.#rpc && this.#networkId !== networkId) {
            await this.disconnect();
        }

        // If already connected to same network, return
        if (this.#rpc && this.#networkId === networkId && this.isConnected) {
            return;
        }

        this.#connectionPromise = this.#doConnect(networkId);
        try {
            await this.#connectionPromise;
        } finally {
            this.#connectionPromise = null;
        }
    }

    async #doConnect(networkId) {
        try {
            await ensureWasmInitialized();
            
            this.#networkId = networkId;
            this.#resolver = new Resolver();
            this.#rpc = new RpcClient({
                resolver: this.#resolver,
                networkId
            });

            await this.#rpc.connect();
            this.#logger.log(`[KaspaClient] Connected to ${networkId}`);
        } catch (err) {
            this.#rpc = null;
            this.#resolver = null;
            this.#networkId = null;
            throw new NetworkError(`Failed to connect to ${networkId}`, err);
        }
    }

    /**
     * Disconnect from the network and clean up resources.
     * @returns {Promise<void>}
     */
    async disconnect() {
        if (!this.#rpc) return;

        try {
            // Remove all event listeners
            for (const [event, listener] of this.#eventListeners) {
                try {
                    this.#rpc.removeEventListener?.(event, listener);
                } catch (_) {}
            }
            this.#eventListeners.clear();

            await this.#rpc.disconnect();
            this.#logger.log('[KaspaClient] Disconnected');
        } catch (err) {
            this.#logger.warn('[KaspaClient] Error during disconnect:', err);
        } finally {
            this.#rpc = null;
            this.#resolver = null;
        }
    }

    /**
     * Dispose of this client permanently. Cannot be reused after disposal.
     * @returns {Promise<void>}
     */
    async dispose() {
        if (this.#disposed) return;
        
        await this.disconnect();
        this.#disposed = true;
        this.#networkId = null;
        this.#logger.log('[KaspaClient] Disposed');
    }

    /**
     * Add an event listener to the RPC client.
     * @param {string} event - Event name
     * @param {Function} listener - Event handler
     */
    addEventListener(event, listener) {
        this.#assertNotDisposed();
        if (!this.#rpc) {
            throw new NetworkError('Not connected. Call connect() first.');
        }
        this.#rpc.addEventListener(event, listener);
        this.#eventListeners.set(event, listener);
    }

    /**
     * Remove an event listener from the RPC client.
     * @param {string} event - Event name
     * @param {Function} listener - Event handler
     */
    removeEventListener(event, listener) {
        if (!this.#rpc) return;
        this.#rpc.removeEventListener?.(event, listener);
        this.#eventListeners.delete(event);
    }

    /**
     * Get the current sink blue score.
     * @returns {Promise<bigint>}
     */
    async getSinkBlueScore() {
        this.#assertNotDisposed();
        if (!this.#rpc) {
            throw new NetworkError('Not connected. Call connect() first.');
        }
        try {
            const res = await this.#rpc.getSinkBlueScore();
            return res.blueScore;
        } catch (err) {
            throw new RpcError('Failed to get sink blue score', err);
        }
    }

    /**
     * Get UTXOs for addresses.
     * @param {string[]} addresses - List of addresses
     * @returns {Promise<any>}
     */
    async getUtxosByAddresses(addresses) {
        this.#assertNotDisposed();
        if (!this.#rpc) {
            throw new NetworkError('Not connected. Call connect() first.');
        }
        try {
            return await this.#rpc.getUtxosByAddresses(addresses);
        } catch (err) {
            throw new RpcError('Failed to get UTXOs by addresses', err);
        }
    }

    /**
     * Get fee estimate rates (in sompi per gram) for low/normal/high priority.
     * These are the raw rates from the node's fee estimate buckets.
     * @returns {Promise<{ low: number | null, normal: number | null, high: number | null }>}
     */
    async getFeeEstimate() {
        this.#assertNotDisposed();
        if (!this.#rpc) {
            throw new NetworkError('Not connected. Call connect() first.');
        }

        try {
            const res = await this.#rpc.getFeeEstimate();
            const estimate = res && (res.estimate || res);

            if (!estimate) {
                throw new RpcError('Fee estimate not available from node');
            }

            const avgFeerate = (buckets) => {
                if (!Array.isArray(buckets) || !buckets.length) return null;
                let sum = 0;
                let count = 0;
                for (const b of buckets) {
                    const r = b && typeof b.feerate === 'number' && Number.isFinite(b.feerate)
                        ? b.feerate
                        : null;
                    if (r != null) {
                        sum += r;
                        count++;
                    }
                }
                if (!count) return null;
                return sum / count;
            };

            const low = avgFeerate(estimate.lowBuckets);
            const normal = avgFeerate(estimate.normalBuckets);
            const high = (estimate.priorityBucket &&
                typeof estimate.priorityBucket.feerate === 'number' &&
                Number.isFinite(estimate.priorityBucket.feerate))
                ? estimate.priorityBucket.feerate
                : null;

            return { low, normal, high };
        } catch (err) {
            if (err instanceof RpcError || err instanceof NetworkError) {
                throw err;
            }
            throw new RpcError('Failed to get fee estimate', err);
        }
    }

    /**
     * Get a block by hash.
     * @param {string} hash - Block hash
     * @param {boolean} [includeTransactions=false]
     * @returns {Promise<any>}
     */
    async getBlock(hash, includeTransactions = false) {
        this.#assertNotDisposed();
        if (!this.#rpc) {
            throw new NetworkError('Not connected. Call connect() first.');
        }
        try {
            return await this.#rpc.getBlock({ hash, includeTransactions });
        } catch (err) {
            throw new RpcError('Failed to get block', err);
        }
    }

    /**
     * Convert script public key to address for current network.
     * @param {string|object} scriptPubKey
     * @returns {string}
     */
    scriptPubKeyToAddress(scriptPubKey) {
        this.#assertNotDisposed();
        if (!this.#networkId) {
            throw new NetworkError('Not connected. Call connect() first.');
        }
        const addr = addressFromScriptPublicKey(scriptPubKey, this.#networkId);
        if (!addr) {
            throw new Error('Unable to derive address from script public key');
        }
        return addr.toString();
    }

    /**
     * Validate a Kaspa address for the current network.
     * @param {string} address
     * @returns {boolean}
     */
    isValidAddress(address) {
        try {
            new Address(address);
            return true;
        } catch {
            return false;
        }
    }

    #assertNotDisposed() {
        if (this.#disposed) {
            throw new DisposedError('KaspaClient');
        }
    }
}

// Re-export SDK utilities for convenience
export {
    kaspaToSompi,
    sompiToKaspaString,
    Address,
    addressFromScriptPublicKey,
    KaspaWallet,
    AccountKind,
    UtxoProcessor,
    KaspaUtxoContext,
    setDefaultStorageFolder,
    ensureWasmInitialized,
    estimateTransactions
};

export default KaspaClient;
