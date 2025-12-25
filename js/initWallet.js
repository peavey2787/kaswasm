// initWallet.js - Application entry point for wallet initialization
// Uses instance-based wallet_wrapper architecture

import { KaspaClient } from '../wasm-wrapper/KaspaClient.js';
import { Wallet } from '../wasm-wrapper/Wallet.js';
import { Events } from '../wasm-wrapper/Events.js';
import { UtxoContext } from '../wasm-wrapper/UtxoContext.js';
import { registerWalletEvents, startBlockStream } from './events.js';
import { updateBalance, updateReceiveAddress } from './ui.js';
import { log } from './log.js';
import { 
    getWalletCreationInfo, 
    getWalletLoadInfo,
    getWalletImportInfo,
    showMnemonicModal,
    renderWalletList
} from './walletManager.js';
import { addWalletToList, hasMnemonicStored, storeMnemonic } from './walletStorage.js';

// Application-level instances (managed lifecycle)
let kaspaClient = null;
let wallet = null;
let events = null;
let utxoContext = null;

// Current wallet info
let currentWalletFilename = null;
let currentWalletPassword = null;

/**
 * Prompt user for wallet password using a Bootstrap-styled modal.
 * @param {string} filename - Wallet filename
 * @param {boolean} [isRetry=false] - Whether this is a retry after failed attempt
 * @returns {Promise<string|null>} - Resolves to the entered password or null if cancelled
 */
function promptForPassword(filename, isRetry = false) {
    return new Promise((resolve) => {
        if (typeof document === 'undefined') {
            // Fallback for non-browser environments
            const msg = isRetry
                ? `Incorrect password. Please try again for wallet "${filename}":`
                : `Enter password for wallet "${filename}":`;
            const value = prompt(msg);
            resolve(value || null);
            return;
        }

        // Remove any existing password modal
        const existing = document.getElementById('walletPasswordModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'walletPasswordModal';
        modal.className = 'modal d-block';
        modal.style.cssText = 'background: rgba(0,0,0,0.85); z-index: 11000;';
        modal.setAttribute('tabindex', '-1');

        const title = 'Wallet Password Required';
        const message = isRetry
            ? `Incorrect password. Please try again for wallet "${filename}".`
            : `Enter password for wallet "${filename}":`;

        modal.innerHTML = `
            <div class="modal-dialog modal-dialog-centered modal-sm">
                <div class="modal-content" style="background-color: var(--kaspa-bg-card); border-color: var(--kaspa-border);">
                    <div class="modal-header" style="background-color: rgba(73, 234, 203, 0.1); border-bottom-color: var(--kaspa-border);">
                        <h5 class="modal-title" style="color: var(--kaspa-primary);">
                            <i class="bi bi-shield-lock me-2"></i>${title}
                        </h5>
                        <button type="button" class="btn-close btn-close-white" id="walletPasswordModalClose"></button>
                    </div>
                    <div class="modal-body">
                        <p class="small text-muted mb-2">${message}</p>
                        <input type="password" class="form-control form-control-sm" id="walletPasswordInput" placeholder="Enter password" autocomplete="current-password" />
                    </div>
                    <div class="modal-footer" style="border-top-color: var(--kaspa-border);">
                        <button type="button" class="btn btn-outline-kaspa btn-sm" id="walletPasswordCancel">Cancel</button>
                        <button type="button" class="btn btn-kaspa btn-sm" id="walletPasswordOk">Continue</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const input = modal.querySelector('#walletPasswordInput');
        const okBtn = modal.querySelector('#walletPasswordOk');
        const cancelBtn = modal.querySelector('#walletPasswordCancel');
        const closeBtn = modal.querySelector('#walletPasswordModalClose');

        const cleanup = () => {
            modal.remove();
            document.removeEventListener('keydown', handleKeyDown);
        };

        const submit = () => {
            const value = input.value.trim();
            cleanup();
            resolve(value || null);
        };

        const cancel = () => {
            cleanup();
            resolve(null);
        };

        const handleKeyDown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                submit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
            }
        };

        okBtn.onclick = submit;
        cancelBtn.onclick = cancel;
        if (closeBtn) closeBtn.onclick = cancel;

        // Do NOT close on background click to avoid accidental dismissal
        // Only explicit actions (OK/Cancel/X or Escape) will close the modal

        document.addEventListener('keydown', handleKeyDown);

        // Focus the input after render
        setTimeout(() => {
            input.focus();
        }, 0);
    });
}

/**
 * Get the current application instances.
 * @returns {{ client: KaspaClient, wallet: Wallet, events: Events, utxoContext: UtxoContext }}
 */
export function getInstances() {
    return { client: kaspaClient, wallet, events, utxoContext };
}

/**
 * Get the current wallet filename.
 * @returns {string|null}
 */
export function getCurrentWalletFilename() {
    return currentWalletFilename;
}

/**
 * Initialize or reinitialize the wallet for a given network.
 * @param {string} networkId - Network to connect to
 * @param {Function} setFirstAccount - Callback to set the first account
 * @param {Function} setLastBalance - Callback to set the last balance
 * @returns {Promise<void>}
 */
export async function initializeWallet(networkId, setFirstAccount, setLastBalance) {
    // Check for wallet creation, import, or load request from session storage
    const createInfo = getWalletCreationInfo();
    const importInfo = getWalletImportInfo();
    const loadInfo = getWalletLoadInfo();
    
    // Determine wallet credentials
    let walletFilename = 'wallet-browser-demo';
    let walletPassword = 'abc';
    let walletMnemonic = null;
    let isNewWallet = false;
    let isImport = false;
    
    if (importInfo) {
        walletFilename = importInfo.filename;
        walletPassword = importInfo.password;
        walletMnemonic = importInfo.mnemonic;
        networkId = importInfo.network || networkId;
        isImport = true;
        log(`Importing wallet: ${walletFilename}`);
    } else if (createInfo) {
        walletFilename = createInfo.filename;
        walletPassword = createInfo.password;
        networkId = createInfo.network || networkId;
        isNewWallet = true;
        log(`Creating new wallet: ${walletFilename}`);
    } else if (loadInfo) {
        walletFilename = loadInfo.filename;
        walletPassword = loadInfo.password;
        log(`Loading wallet: ${walletFilename}`);
    } else {
        // Check for last used wallet in localStorage
        const lastWallet = localStorage.getItem('kaspa_last_wallet');
        const lastPassword = sessionStorage.getItem('kaspa_wallet_password');
        if (lastWallet) {
            walletFilename = lastWallet;
            // If we don't have password in session, we need to prompt
            if (!lastPassword) {
                const storedPassword = await promptForPassword(walletFilename);
                if (!storedPassword) {
                    // User explicitly cancelled login; abort initialization completely
                    log('Wallet open cancelled by user (no password provided).');
                    throw new Error('Wallet open cancelled');
                }
                walletPassword = storedPassword;
            } else {
                walletPassword = lastPassword;
            }
            log(`Resuming wallet: ${walletFilename}`);
        }
    }
    
    // Store current wallet info
    currentWalletFilename = walletFilename;
    currentWalletPassword = walletPassword;
    sessionStorage.setItem('kaspa_current_wallet', walletFilename);
    localStorage.setItem('kaspa_last_wallet', walletFilename);
    
    // Dispose previous instances if switching networks
    if (kaspaClient && kaspaClient.networkId !== networkId) {
        await disposeAll();
    }

    // Create new client if needed
    if (!kaspaClient) {
        kaspaClient = new KaspaClient();
    }

    // Connect to network
    if (!kaspaClient.isConnected || kaspaClient.networkId !== networkId) {
        await kaspaClient.connect(networkId);
    }

    // Create wallet instance with retry on password failure
    if (!wallet) {
        wallet = new Wallet(kaspaClient);
        
        let attempts = 0;

        // Handle wallet import, creation, or opening
        if (isImport && walletMnemonic) {
            // Import wallet from mnemonic
            try {
                await wallet.import(walletPassword, walletMnemonic, walletFilename);
                log(`Wallet "${walletFilename}" imported successfully.`);
                
                // Check if user wants to store the mnemonic
                const importStoragePreference = importInfo.storagePreference || 'no_save';
                let mnemonicStored = false;
                
                if (importStoragePreference === 'store_encrypted') {
                    try {
                        await storeMnemonic(walletFilename, walletMnemonic, walletPassword);
                        mnemonicStored = true;
                        log('Mnemonic encrypted and stored in browser storage.');
                    } catch (storeErr) {
                        log(`Warning: Failed to store mnemonic: ${storeErr.message}`);
                    }
                }
                
                // Add to wallet list with mnemonic storage status
                addWalletToList(walletFilename, networkId, mnemonicStored);
                renderWalletList();
                
                // Clear password from session storage since import is complete
                sessionStorage.removeItem('kaspa_wallet_password');
            } catch (err) {
                log(`Import failed: ${err.message}`);
                throw err;
            }
        } else {
            // Keep prompting until the correct password is entered or the user cancels.
            // For existing wallets we treat any create/open failure as a password issue and
            // give the user another chance, since the underlying SDK error is wrapped.
            while (true) {
                try {
                    await wallet.create(walletPassword, walletFilename);
                    break; // Success - exit the loop
                } catch (err) {
                    // If this was during brand new wallet creation, don't loop forever –
                    // just surface the error.
                    if (isNewWallet) {
                        throw err;
                    }

                    attempts++;
                    log(`Unable to open wallet "${walletFilename}" (attempt ${attempts}).`);

                    // Prompt for password again
                    const retryPassword = await promptForPassword(walletFilename, attempts > 0);
                    if (!retryPassword) {
                        log('Wallet open cancelled by user.');
                        throw new Error('Wallet open cancelled');
                    }
                    walletPassword = retryPassword;
                    currentWalletPassword = walletPassword;
                }
            }
            
            // Check if first-time setup is handling mnemonic display (storage preference is set)
            const firstTimeSetupHandling = sessionStorage.getItem('kaspa_storage_preference');
            
            // If this is a newly created wallet and first-time setup is NOT handling it, show mnemonic modal
            const mnemonic = await wallet.getMnemonic();
            if (isNewWallet && mnemonic && !firstTimeSetupHandling) {
                // Add to wallet list before showing modal
                addWalletToList(walletFilename, networkId, false);
                
                // Show mnemonic modal
                showMnemonicModal(mnemonic, walletFilename, walletPassword, (savedMnemonic) => {
                    // Update wallet list entry with mnemonic status
                    addWalletToList(walletFilename, networkId, savedMnemonic);
                    renderWalletList();
                    log('Wallet creation complete!');
                });
            } else if (isNewWallet && !firstTimeSetupHandling) {
                // Wallet created but no mnemonic available (existing wallet file)
                addWalletToList(walletFilename, networkId, hasMnemonicStored(walletFilename));
                log('Loaded existing wallet file.');
            }
            // If firstTimeSetupHandling is true, the app.js will handle mnemonic display after initializeWallet returns
        }
    }

    // Get accounts
    const accounts = await wallet.listAccounts();
    const firstAccount = accounts.accountDescriptors[0];
    setFirstAccount(firstAccount);

    // Activate account
    if (firstAccount?.accountId) {
        await wallet.accountsActivate({ accountIds: [firstAccount.accountId] });
    }

    // Update UI
    if (firstAccount?.receiveAddress) {
        updateReceiveAddress(firstAccount.receiveAddress);
    }

    // Register wallet events
    wallet.clearEventHandlers();
    registerWalletEvents(wallet, () => firstAccount, setLastBalance);

    // Create events instance
    if (!events) {
        events = new Events(kaspaClient);
    }

    // Start live block stream into UI container
    await startBlockStream(events);

    // Create UTXO context
    if (!utxoContext) {
        utxoContext = new UtxoContext(kaspaClient);
        await utxoContext.init();
    }

    // Watch addresses
    if (firstAccount?.receiveAddress) {
        const watchList = [firstAccount.receiveAddress, firstAccount.changeAddress].filter(Boolean);
        await utxoContext.watchAddresses(watchList);
        const balance = utxoContext.balance;
        updateBalance(balance);
    }
}

/**
 * Dispose all instances and clean up resources.
 * @returns {Promise<void>}
 */
export async function disposeAll() {
    if (utxoContext) {
        await utxoContext.dispose();
        utxoContext = null;
    }
    if (events) {
        await events.dispose();
        events = null;
    }
    if (wallet) {
        await wallet.dispose();
        wallet = null;
    }
    if (kaspaClient) {
        await kaspaClient.dispose();
        kaspaClient = null;
    }
}

// Cleanup on page unload
if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
        disposeAll().catch(() => {});
    });
}
