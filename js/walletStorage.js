// walletStorage.js - Manage wallet storage in localStorage
// Handles encrypted mnemonic storage and wallet listing
// Uses Web Crypto API with PBKDF2 key derivation and AES-GCM encryption

const WALLET_LIST_KEY = 'kaspa_wallets';
const MNEMONIC_PREFIX = 'kaspa_mnemonic_';

// Crypto constants
const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH = 256;

/**
 * Derive a cryptographic key from a password using PBKDF2.
 * @param {string} password - User password
 * @param {Uint8Array} salt - Random salt
 * @returns {Promise<CryptoKey>}
 */
async function deriveKey(password, salt) {
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);
    
    // Import password as raw key material
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        passwordBuffer,
        'PBKDF2',
        false,
        ['deriveKey']
    );
    
    // Derive AES-GCM key using PBKDF2
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt,
            iterations: PBKDF2_ITERATIONS,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: KEY_LENGTH },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypt text using AES-GCM with PBKDF2-derived key.
 * @param {string} plaintext - Text to encrypt
 * @param {string} password - Encryption password
 * @returns {Promise<string>} Base64-encoded salt + IV + ciphertext
 */
async function encrypt(plaintext, password) {
    const encoder = new TextEncoder();
    const plaintextBuffer = encoder.encode(plaintext);
    
    // Generate random salt and IV
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    
    // Derive key and encrypt
    const key = await deriveKey(password, salt);
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        plaintextBuffer
    );
    
    // Combine salt + IV + ciphertext
    const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(ciphertext), salt.length + iv.length);
    
    // Base64 encode
    return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt text using AES-GCM with PBKDF2-derived key.
 * @param {string} encoded - Base64-encoded salt + IV + ciphertext
 * @param {string} password - Decryption password
 * @returns {Promise<string>} Decrypted plaintext
 * @throws {Error} If decryption fails (wrong password or corrupted data)
 */
async function decrypt(encoded, password) {
    // Base64 decode
    const combined = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
    
    // Extract salt, IV, and ciphertext
    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);
    
    // Derive key and decrypt
    const key = await deriveKey(password, salt);
    const plaintextBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(plaintextBuffer);
}

/**
 * Get list of all stored wallets.
 * @returns {{ filename: string, network: string, createdAt: string, hasMnemonic: boolean }[]}
 */
export function getStoredWallets() {
    try {
        const data = localStorage.getItem(WALLET_LIST_KEY);
        if (!data) return [];
        return JSON.parse(data);
    } catch {
        return [];
    }
}

/**
 * Add a wallet to the stored list.
 * @param {string} filename - Wallet filename
 * @param {string} network - Network ID
 * @param {boolean} [hasMnemonic=false] - Whether mnemonic is stored
 */
export function addWalletToList(filename, network, hasMnemonic = false) {
    const wallets = getStoredWallets();
    
    // Check if already exists
    const exists = wallets.find(w => w.filename === filename);
    if (exists) {
        // Update network if different
        exists.network = network;
        exists.lastUsed = new Date().toISOString();
        // Update hasMnemonic if provided as true
        if (hasMnemonic) {
            exists.hasMnemonic = true;
        }
    } else {
        wallets.push({
            filename,
            network,
            createdAt: new Date().toISOString(),
            lastUsed: new Date().toISOString(),
            hasMnemonic
        });
    }
    
    localStorage.setItem(WALLET_LIST_KEY, JSON.stringify(wallets));
}

/**
 * Remove a wallet from the stored list and its mnemonic.
 * @param {string} filename - Wallet filename
 */
export function removeWalletFromList(filename) {
    const wallets = getStoredWallets();
    const filtered = wallets.filter(w => w.filename !== filename);
    localStorage.setItem(WALLET_LIST_KEY, JSON.stringify(filtered));
    
    // Also remove mnemonic if stored
    localStorage.removeItem(MNEMONIC_PREFIX + filename);
}

/**
 * Store encrypted mnemonic for a wallet.
 * @param {string} filename - Wallet filename
 * @param {string} mnemonic - Mnemonic phrase
 * @param {string} password - Encryption password
 * @returns {Promise<void>}
 */
export async function storeMnemonic(filename, mnemonic, password) {
    const encrypted = await encrypt(mnemonic, password);
    localStorage.setItem(MNEMONIC_PREFIX + filename, encrypted);
    
    // Update wallet list to indicate mnemonic is stored
    const wallets = getStoredWallets();
    const wallet = wallets.find(w => w.filename === filename);
    if (wallet) {
        wallet.hasMnemonic = true;
        localStorage.setItem(WALLET_LIST_KEY, JSON.stringify(wallets));
    }
}

/**
 * Retrieve and decrypt mnemonic for a wallet.
 * @param {string} filename - Wallet filename
 * @param {string} password - Decryption password
 * @returns {Promise<string|null>} Mnemonic or null if not found/invalid
 */
export async function retrieveMnemonic(filename, password) {
    try {
        const encrypted = localStorage.getItem(MNEMONIC_PREFIX + filename);
        if (!encrypted) return null;
        return await decrypt(encrypted, password);
    } catch {
        return null;
    }
}

/**
 * Check if a wallet has a stored mnemonic.
 * @param {string} filename - Wallet filename
 * @returns {boolean}
 */
export function hasMnemonicStored(filename) {
    return localStorage.getItem(MNEMONIC_PREFIX + filename) !== null;
}

/**
 * Clear all wallet data from localStorage.
 */
export function clearAllWalletData() {
    const wallets = getStoredWallets();
    
    // Remove all mnemonics
    for (const wallet of wallets) {
        localStorage.removeItem(MNEMONIC_PREFIX + wallet.filename);
    }
    
    // Remove wallet list
    localStorage.removeItem(WALLET_LIST_KEY);
}

/**
 * Get storage usage info.
 * @returns {{ walletCount: number, totalSize: string }}
 */
export function getStorageInfo() {
    const wallets = getStoredWallets();
    let totalBytes = 0;
    
    for (const key in localStorage) {
        if (key.startsWith('kaspa_') || key.startsWith(MNEMONIC_PREFIX)) {
            totalBytes += localStorage.getItem(key).length * 2; // UTF-16
        }
    }
    
    return {
        walletCount: wallets.length,
        totalSize: totalBytes < 1024 
            ? `${totalBytes} bytes` 
            : `${(totalBytes / 1024).toFixed(2)} KB`
    };
}
