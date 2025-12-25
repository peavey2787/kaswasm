// firstTimeSetup.js - First-time user setup wizard
// Shows a modal to configure the first wallet on initial app load

import { getStoredWallets, addWalletToList, storeMnemonic } from './walletStorage.js';
import { log } from './log.js';

const FIRST_TIME_SETUP_KEY = 'kaspa_first_time_setup_complete';

/**
 * Check if first-time setup is needed.
 * Returns true if no wallets exist and setup hasn't been completed.
 * @returns {boolean}
 */
export function isFirstTimeSetupNeeded() {
    const setupComplete = localStorage.getItem(FIRST_TIME_SETUP_KEY);
    if (setupComplete === 'true') {
        return false;
    }
    const wallets = getStoredWallets();
    return wallets.length === 0;
}

/**
 * Mark first-time setup as complete.
 */
export function markFirstTimeSetupComplete() {
    localStorage.setItem(FIRST_TIME_SETUP_KEY, 'true');
}

/**
 * Reset first-time setup state so the wizard will show again
 * on next load (used when the last wallet is removed).
 */
export function resetFirstTimeSetupFlag() {
    localStorage.removeItem(FIRST_TIME_SETUP_KEY);
}

/**
 * Storage preference options.
 */
export const StoragePreference = {
    SHOW_MNEMONIC: 'show_mnemonic',
    STORE_ENCRYPTED: 'store_encrypted'
};

/**
 * Show the first-time setup wizard modal.
 * @returns {Promise<{walletName: string, password: string, network: string, storagePreference: string, mnemonic?: string, isImport?: boolean} | null>}
 *          Returns setup config or null if cancelled.
 */
export function showFirstTimeSetupWizard() {
    return new Promise((resolve) => {
        // Remove any existing modal
        const existing = document.getElementById('firstTimeSetupModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'firstTimeSetupModal';
        modal.className = 'modal d-block';
        modal.style.cssText = 'background: rgba(0,0,0,0.95); z-index: 15000;';
        modal.setAttribute('tabindex', '-1');

        modal.innerHTML = `
            <div class="modal-dialog modal-dialog-centered modal-lg">
                <div class="modal-content" style="background-color: var(--kaspa-bg-card); border: 2px solid var(--kaspa-primary);">
                    <div class="modal-header" style="background: linear-gradient(135deg, rgba(73, 234, 203, 0.15), rgba(73, 234, 203, 0.05)); border-bottom-color: var(--kaspa-border);">
                        <h4 class="modal-title" style="color: var(--kaspa-primary);">
                            <i class="bi bi-wallet2 me-2"></i>Welcome to Kaspa WASM Browser Demo
                        </h4>
                    </div>
                    <div class="modal-body">
                        <div class="alert alert-info mb-4" style="background-color: rgba(73, 234, 203, 0.1); border-color: var(--kaspa-primary); color: var(--kaspa-text);">
                            <h6 class="alert-heading mb-2">
                                <i class="bi bi-info-circle me-2"></i>First Time Setup
                            </h6>
                            <p class="mb-0 small">
                                Create a new wallet or import an existing one using your recovery phrase.
                            </p>
                        </div>

                        <!-- Tab Navigation -->
                        <ul class="nav nav-tabs mb-4" id="setupTabs" role="tablist">
                            <li class="nav-item" role="presentation">
                                <button class="nav-link active" id="createTab" data-bs-toggle="tab" data-bs-target="#createPane" 
                                        type="button" role="tab" aria-controls="createPane" aria-selected="true">
                                    <i class="bi bi-plus-circle me-1"></i>Create New Wallet
                                </button>
                            </li>
                            <li class="nav-item" role="presentation">
                                <button class="nav-link" id="importTab" data-bs-toggle="tab" data-bs-target="#importPane" 
                                        type="button" role="tab" aria-controls="importPane" aria-selected="false">
                                    <i class="bi bi-box-arrow-in-down me-1"></i>Import Existing
                                </button>
                            </li>
                        </ul>

                        <!-- Tab Content -->
                        <div class="tab-content" id="setupTabContent">
                            <!-- Create New Wallet Pane -->
                            <div class="tab-pane fade show active" id="createPane" role="tabpanel" aria-labelledby="createTab">
                                <!-- Wallet Name -->
                                <div class="mb-3">
                                    <label for="setupWalletName" class="form-label">
                                        <i class="bi bi-tag me-1"></i>Wallet Name
                                    </label>
                                    <input type="text" class="form-control" id="setupWalletName" 
                                        placeholder="my-first-wallet" value="my-wallet"
                                        title="Letters, numbers, hyphens and underscores only">
                                    <div class="form-text">A unique name to identify this wallet.</div>
                                </div>

                                <!-- Password -->
                                <div class="mb-3">
                                    <label for="setupPassword" class="form-label">
                                        <i class="bi bi-lock me-1"></i>Password
                                    </label>
                                    <input type="password" class="form-control" id="setupPassword" 
                                           placeholder="Enter a strong password" autocomplete="new-password">
                                </div>

                                <!-- Confirm Password -->
                                <div class="mb-3">
                                    <label for="setupPasswordConfirm" class="form-label">
                                        <i class="bi bi-lock-fill me-1"></i>Confirm Password
                                    </label>
                                    <input type="password" class="form-control" id="setupPasswordConfirm" 
                                           placeholder="Re-enter your password" autocomplete="new-password">
                                </div>

                                <!-- Network -->
                                <div class="mb-3">
                                    <label for="setupNetwork" class="form-label">
                                        <i class="bi bi-globe me-1"></i>Network
                                    </label>
                                    <select class="form-select" id="setupNetwork">
                                        <option value="testnet-10" selected>testnet-10 (Recommended for testing)</option>
                                        <option value="testnet-11">testnet-11</option>
                                        <option value="mainnet">mainnet (Real funds)</option>
                                    </select>
                                </div>

                                <!-- Storage Preference -->
                                <div class="mb-3">
                                    <label class="form-label">
                                        <i class="bi bi-shield-lock me-1"></i>Recovery Phrase Storage
                                    </label>
                                    <div class="p-3 rounded" style="background-color: var(--kaspa-bg-input);">
                                        <div class="form-check mb-2">
                                            <input class="form-check-input" type="radio" name="storagePreference" 
                                                   id="prefShowMnemonic" value="show_mnemonic" checked>
                                            <label class="form-check-label small" for="prefShowMnemonic">
                                                <strong><i class="bi bi-eye me-1"></i>Show Mnemonic</strong> - 
                                                <span class="text-muted">Display recovery phrase to save manually (most secure)</span>
                                            </label>
                                        </div>
                                        <div class="form-check">
                                            <input class="form-check-input" type="radio" name="storagePreference" 
                                                   id="prefStoreEncrypted" value="store_encrypted">
                                            <label class="form-check-label small" for="prefStoreEncrypted">
                                                <strong><i class="bi bi-hdd me-1"></i>Store Encrypted</strong> - 
                                                <span class="text-muted">Encrypt and store in browser (convenient)</span>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Import Existing Wallet Pane -->
                            <div class="tab-pane fade" id="importPane" role="tabpanel" aria-labelledby="importTab">
                                <!-- Import Wallet Name -->
                                <div class="mb-3">
                                    <label for="importWalletName" class="form-label">
                                        <i class="bi bi-tag me-1"></i>Wallet Name
                                    </label>
                                    <input type="text" class="form-control" id="importWalletName" 
                                        placeholder="imported-wallet" value="imported-wallet">
                                    <div class="form-text">A name for this imported wallet.</div>
                                </div>

                                <!-- Import Password -->
                                <div class="mb-3">
                                    <label for="importPassword" class="form-label">
                                        <i class="bi bi-lock me-1"></i>New Password
                                    </label>
                                    <input type="password" class="form-control" id="importPassword" 
                                           placeholder="Enter a password" autocomplete="new-password">
                                    <div class="form-text">This password will encrypt your imported wallet.</div>
                                </div>

                                <!-- Import Confirm Password -->
                                <div class="mb-3">
                                    <label for="importPasswordConfirm" class="form-label">
                                        <i class="bi bi-lock-fill me-1"></i>Confirm Password
                                    </label>
                                    <input type="password" class="form-control" id="importPasswordConfirm" 
                                           placeholder="Re-enter password" autocomplete="new-password">
                                </div>

                                <!-- Import Network -->
                                <div class="mb-3">
                                    <label for="importNetwork" class="form-label">
                                        <i class="bi bi-globe me-1"></i>Network
                                    </label>
                                    <select class="form-select" id="importNetwork">
                                        <option value="testnet-10" selected>testnet-10 (Recommended for testing)</option>
                                        <option value="testnet-11">testnet-11</option>
                                        <option value="mainnet">mainnet (Real funds)</option>
                                    </select>
                                </div>

                                <!-- Mnemonic Input -->
                                <div class="mb-3">
                                    <label for="importMnemonic" class="form-label">
                                        <i class="bi bi-key me-1"></i>Recovery Phrase (12 or 24 words)
                                    </label>
                                    <textarea class="form-control font-monospace" id="importMnemonic" rows="3"
                                              placeholder="Enter your recovery phrase words separated by spaces..."
                                              style="font-size: 0.9rem;"></textarea>
                                    <div class="form-text d-flex justify-content-between">
                                        <span>Enter words separated by spaces.</span>
                                        <span id="importWordCount" class="text-muted">0 words</span>
                                    </div>
                                </div>

                                <div class="alert alert-warning small mb-0" style="background-color: rgba(255, 193, 7, 0.15); border-color: #ffc107;">
                                    <i class="bi bi-shield-exclamation me-2"></i>
                                    <strong>Security:</strong> Never share your recovery phrase with anyone.
                                </div>
                            </div>
                        </div>

                        <!-- Warning -->
                        <div class="alert alert-warning small mt-3" style="background-color: rgba(255, 193, 7, 0.15); border-color: #ffc107;">
                            <i class="bi bi-exclamation-triangle me-2"></i>
                            <strong>Important:</strong> Your password cannot be recovered if lost. 
                            If you lose both your password and recovery phrase, your funds will be permanently inaccessible.
                        </div>

                        <!-- Validation Error Display -->
                        <div id="setupErrorMsg" class="alert alert-danger small d-none" 
                             style="background-color: rgba(248, 81, 73, 0.15); border-color: #f85149;">
                        </div>
                    </div>
                    <div class="modal-footer" style="border-top-color: var(--kaspa-border);">
                        <button type="button" class="btn btn-outline-secondary btn-sm" id="setupSkipBtn">
                            <i class="bi bi-x-lg me-1"></i>Skip for Now
                        </button>
                        <button type="button" class="btn btn-kaspa" id="setupCreateBtn">
                            <i class="bi bi-plus-lg me-1"></i>Create Wallet
                        </button>
                        <button type="button" class="btn btn-kaspa d-none" id="setupImportBtn">
                            <i class="bi bi-box-arrow-in-down me-1"></i>Import Wallet
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Create tab elements
        const walletNameInput = modal.querySelector('#setupWalletName');
        const passwordInput = modal.querySelector('#setupPassword');
        const passwordConfirmInput = modal.querySelector('#setupPasswordConfirm');
        const networkSelect = modal.querySelector('#setupNetwork');
        
        // Import tab elements
        const importWalletNameInput = modal.querySelector('#importWalletName');
        const importPasswordInput = modal.querySelector('#importPassword');
        const importPasswordConfirmInput = modal.querySelector('#importPasswordConfirm');
        const importNetworkSelect = modal.querySelector('#importNetwork');
        const importMnemonicInput = modal.querySelector('#importMnemonic');
        const importWordCountEl = modal.querySelector('#importWordCount');
        
        // Buttons
        const createBtn = modal.querySelector('#setupCreateBtn');
        const importBtn = modal.querySelector('#setupImportBtn');
        const skipBtn = modal.querySelector('#setupSkipBtn');
        const errorMsg = modal.querySelector('#setupErrorMsg');
        
        // Tab elements
        const createTab = modal.querySelector('#createTab');
        const importTab = modal.querySelector('#importTab');
        const createPane = modal.querySelector('#createPane');
        const importPane = modal.querySelector('#importPane');

        // Track current mode
        let isImportMode = false;

        const showError = (msg) => {
            errorMsg.textContent = msg;
            errorMsg.classList.remove('d-none');
        };

        const hideError = () => {
            errorMsg.classList.add('d-none');
        };

        const cleanup = () => {
            modal.remove();
        };

        // Update word count for mnemonic input
        importMnemonicInput.addEventListener('input', () => {
            const words = importMnemonicInput.value.trim().split(/\s+/).filter(w => w.length > 0);
            const count = words.length;
            importWordCountEl.textContent = `${count} word${count !== 1 ? 's' : ''}`;
            
            if ([12, 15, 18, 21, 24].includes(count)) {
                importWordCountEl.classList.remove('text-muted', 'text-danger');
                importWordCountEl.classList.add('text-success');
            } else if (count > 0) {
                importWordCountEl.classList.remove('text-muted', 'text-success');
                importWordCountEl.classList.add('text-danger');
            } else {
                importWordCountEl.classList.remove('text-success', 'text-danger');
                importWordCountEl.classList.add('text-muted');
            }
        });

        // Tab switching
        createTab.addEventListener('click', () => {
            isImportMode = false;
            createPane.classList.add('show', 'active');
            importPane.classList.remove('show', 'active');
            createTab.classList.add('active');
            importTab.classList.remove('active');
            createBtn.classList.remove('d-none');
            importBtn.classList.add('d-none');
            hideError();
        });

        importTab.addEventListener('click', () => {
            isImportMode = true;
            importPane.classList.add('show', 'active');
            createPane.classList.remove('show', 'active');
            importTab.classList.add('active');
            createTab.classList.remove('active');
            importBtn.classList.remove('d-none');
            createBtn.classList.add('d-none');
            hideError();
        });

        const validateCreate = () => {
            hideError();

            const walletName = walletNameInput.value.trim();
            const password = passwordInput.value;
            const passwordConfirm = passwordConfirmInput.value;

            if (!walletName) {
                showError('Please enter a wallet name.');
                walletNameInput.focus();
                return null;
            }

            if (!/^[a-zA-Z0-9_-]+$/.test(walletName)) {
                showError('Wallet name can only contain letters, numbers, hyphens, and underscores.');
                walletNameInput.focus();
                return null;
            }

            if (!password) {
                showError('Please enter a password.');
                passwordInput.focus();
                return null;
            }

            if (password.length < 4) {
                showError('Password must be at least 4 characters long.');
                passwordInput.focus();
                return null;
            }

            if (password !== passwordConfirm) {
                showError('Passwords do not match.');
                passwordConfirmInput.focus();
                return null;
            }

            const network = networkSelect.value;
            const storagePref = modal.querySelector('input[name="storagePreference"]:checked').value;

            return {
                walletName,
                password,
                network,
                storagePreference: storagePref,
                isImport: false
            };
        };

        const validateImport = () => {
            hideError();

            const walletName = importWalletNameInput.value.trim();
            const password = importPasswordInput.value;
            const passwordConfirm = importPasswordConfirmInput.value;
            const mnemonic = importMnemonicInput.value.trim().toLowerCase();

            if (!walletName) {
                showError('Please enter a wallet name.');
                importWalletNameInput.focus();
                return null;
            }

            if (!/^[a-zA-Z0-9_-]+$/.test(walletName)) {
                showError('Wallet name can only contain letters, numbers, hyphens, and underscores.');
                importWalletNameInput.focus();
                return null;
            }

            if (!password) {
                showError('Please enter a password.');
                importPasswordInput.focus();
                return null;
            }

            if (password.length < 4) {
                showError('Password must be at least 4 characters long.');
                importPasswordInput.focus();
                return null;
            }

            if (password !== passwordConfirm) {
                showError('Passwords do not match.');
                importPasswordConfirmInput.focus();
                return null;
            }

            if (!mnemonic) {
                showError('Please enter your recovery phrase.');
                importMnemonicInput.focus();
                return null;
            }

            const words = mnemonic.split(/\s+/).filter(w => w.length > 0);
            if (![12, 15, 18, 21, 24].includes(words.length)) {
                showError(`Invalid word count: ${words.length}. Expected 12, 15, 18, 21, or 24 words.`);
                importMnemonicInput.focus();
                return null;
            }

            const network = importNetworkSelect.value;

            return {
                walletName,
                password,
                network,
                mnemonic: words.join(' '),
                storagePreference: 'show_mnemonic', // Not needed for import
                isImport: true
            };
        };

        const submitCreate = () => {
            const config = validateCreate();
            if (config) {
                cleanup();
                resolve(config);
            }
        };

        const submitImport = () => {
            const config = validateImport();
            if (config) {
                cleanup();
                resolve(config);
            }
        };

        const skip = () => {
            cleanup();
            resolve(null);
        };

        createBtn.onclick = submitCreate;
        importBtn.onclick = submitImport;
        skipBtn.onclick = skip;

        // Handle Enter key
        const handleKeyDown = (e) => {
            if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
                if (isImportMode) {
                    submitImport();
                } else {
                    submitCreate();
                }
            } else if (e.key === 'Escape') {
                // Don't allow escape to skip - require explicit action
            }
        };

        modal.addEventListener('keydown', handleKeyDown);

        // Focus the wallet name input
        setTimeout(() => {
            walletNameInput.focus();
            walletNameInput.select();
        }, 100);
    });
}

/**
 * Handle the first-time setup flow.
 * Creates wallet and handles mnemonic based on user preference.
 * @param {Object} config - Setup configuration from wizard
 * @param {import('../wasm-wrapper/Wallet.js').Wallet} wallet - Wallet instance
 * @returns {Promise<boolean>} - True if setup completed successfully
 */
export async function handleFirstTimeSetup(config, wallet) {
    const { walletName, password, network, storagePreference } = config;

    try {
        log(`Creating first wallet: ${walletName} on ${network}...`);

        // Get the mnemonic after creation
        const mnemonic = await wallet.getMnemonic();

        if (!mnemonic) {
            log('Warning: Could not retrieve mnemonic from wallet.');
            addWalletToList(walletName, network, false);
            markFirstTimeSetupComplete();
            return true;
        }

        if (storagePreference === StoragePreference.STORE_ENCRYPTED) {
            // Store encrypted mnemonic in localStorage
            await storeMnemonic(walletName, mnemonic, password);
            addWalletToList(walletName, network, true);
            log('Mnemonic encrypted and stored in browser storage.');

            // Show confirmation
            showStorageConfirmationModal(walletName);
        } else {
            // Show mnemonic to user - they must write it down
            addWalletToList(walletName, network, false);
            await showMnemonicDisplayModal(mnemonic, walletName, password);
        }

        markFirstTimeSetupComplete();
        return true;

    } catch (err) {
        log('First-time setup failed: ' + (err?.message || String(err)));
        return false;
    }
}

/**
 * Show a modal displaying the mnemonic for the user to write down.
 * @param {string} mnemonic - The mnemonic phrase
 * @param {string} walletName - Wallet filename
 * @param {string} password - Wallet password (for optional save)
 * @returns {Promise<void>}
 */
function showMnemonicDisplayModal(mnemonic, walletName, password) {
    return new Promise((resolve) => {
        const existing = document.getElementById('mnemonicDisplayModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'mnemonicDisplayModal';
        modal.className = 'modal d-block';
        modal.style.cssText = 'background: rgba(0,0,0,0.95); z-index: 16000;';
        modal.setAttribute('tabindex', '-1');

        const words = mnemonic.split(' ');
        const wordGrid = words.map((word, i) =>
            `<span class="badge bg-dark border border-secondary m-1 p-2 font-monospace">
                <small class="text-muted me-1">${i + 1}.</small>${word}
            </span>`
        ).join('');

        modal.innerHTML = `
            <div class="modal-dialog modal-dialog-centered modal-lg">
                <div class="modal-content" style="background-color: var(--kaspa-bg-card); border: 2px solid #ffc107;">
                    <div class="modal-header" style="background-color: rgba(255, 193, 7, 0.15); border-bottom-color: #ffc107;">
                        <h5 class="modal-title" style="color: #ffc107;">
                            <i class="bi bi-key-fill me-2"></i>Your Recovery Phrase
                        </h5>
                    </div>
                    <div class="modal-body">
                        <div class="alert alert-danger mb-3" style="background-color: rgba(248, 81, 73, 0.15); border-color: #f85149;">
                            <h6 class="alert-heading mb-2">
                                <i class="bi bi-exclamation-triangle-fill me-2"></i>Write This Down NOW!
                            </h6>
                            <p class="mb-0 small">
                                This is your <strong>only chance</strong> to see these words. 
                                Write them down in order and store them in a safe place. 
                                Anyone with these words can access your funds.
                            </p>
                        </div>

                        <div class="p-3 rounded mb-3" style="background-color: var(--kaspa-bg-input);">
                            <div class="d-flex flex-wrap justify-content-center">
                                ${wordGrid}
                            </div>
                        </div>

                        <div class="mb-3">
                            <label class="form-label small text-muted">
                                <i class="bi bi-clipboard me-1"></i>Plain text (for copying):
                            </label>
                            <div class="input-group input-group-sm">
                                <input type="text" class="form-control font-monospace" id="mnemonicPlainText" 
                                       value="${mnemonic}" readonly style="background-color: var(--kaspa-bg-input);">
                                <button class="btn btn-outline-kaspa" id="copyMnemonicBtn" type="button">
                                    <i class="bi bi-clipboard"></i>
                                </button>
                            </div>
                        </div>

                        <div class="form-check mb-3">
                            <input class="form-check-input" type="checkbox" id="mnemonicConfirmCheck">
                            <label class="form-check-label small" for="mnemonicConfirmCheck">
                                I have written down my recovery phrase and stored it safely.
                            </label>
                        </div>

                        <div class="alert alert-secondary small">
                            <i class="bi bi-lightbulb me-1"></i>
                            <strong>Tip:</strong> You can also save your mnemonic encrypted in the browser later using the "Retrieve Stored Mnemonic" feature.
                        </div>
                    </div>
                    <div class="modal-footer" style="border-top-color: var(--kaspa-border);">
                        <button type="button" class="btn btn-outline-kaspa btn-sm" id="saveMnemonicLaterBtn">
                            <i class="bi bi-hdd me-1"></i>Also Save Encrypted
                        </button>
                        <button type="button" class="btn btn-kaspa" id="mnemonicContinueBtn" disabled>
                            <i class="bi bi-check-lg me-1"></i>I've Saved It - Continue
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const confirmCheck = modal.querySelector('#mnemonicConfirmCheck');
        const continueBtn = modal.querySelector('#mnemonicContinueBtn');
        const copyBtn = modal.querySelector('#copyMnemonicBtn');
        const saveBtn = modal.querySelector('#saveMnemonicLaterBtn');

        confirmCheck.onchange = () => {
            continueBtn.disabled = !confirmCheck.checked;
        };

        if (copyBtn) {
            // Use the same standardized copy handler as walletManager
            // (re-implemented here to avoid cross-module dependency)
            const originalHtml = copyBtn.innerHTML;
            const originalClasses = copyBtn.className;

            copyBtn.onclick = async () => {
                try {
                    await navigator.clipboard.writeText(mnemonic);
                    copyBtn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Copied!';
                    copyBtn.classList.remove('btn-outline-primary', 'btn-outline-kaspa');
                    copyBtn.classList.add('btn-success');
                    setTimeout(() => {
                        copyBtn.innerHTML = originalHtml;
                        copyBtn.className = originalClasses;
                    }, 2000);
                } catch (err) {
                    log('Failed to copy mnemonic: ' + (err?.message || String(err)));
                }
            };
        }

        saveBtn.onclick = async () => {
            try {
                await storeMnemonic(walletName, mnemonic, password);
                addWalletToList(walletName, null, true);
                saveBtn.innerHTML = '<i class="bi bi-check me-1"></i>Saved!';
                saveBtn.disabled = true;
                saveBtn.classList.remove('btn-outline-kaspa');
                saveBtn.classList.add('btn-success');
                log('Mnemonic also saved encrypted to browser storage.');
            } catch (err) {
                log('Failed to save mnemonic: ' + (err?.message || String(err)));
            }
        };

        continueBtn.onclick = () => {
            modal.remove();
            resolve();
        };

        // Focus the checkbox
        setTimeout(() => {
            confirmCheck.focus();
        }, 100);
    });
}

/**
 * Show a simple confirmation that mnemonic was stored.
 * @param {string} walletName - Wallet filename
 */
function showStorageConfirmationModal(walletName) {
    const existing = document.getElementById('storageConfirmModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'storageConfirmModal';
    modal.className = 'modal d-block';
    modal.style.cssText = 'background: rgba(0,0,0,0.85); z-index: 16000;';
    modal.setAttribute('tabindex', '-1');

    modal.innerHTML = `
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content" style="background-color: var(--kaspa-bg-card); border: 2px solid #22c55e;">
                <div class="modal-header" style="background-color: rgba(34, 197, 94, 0.15); border-bottom-color: #22c55e;">
                    <h5 class="modal-title" style="color: #22c55e;">
                        <i class="bi bi-check-circle-fill me-2"></i>Wallet Created Successfully
                    </h5>
                </div>
                <div class="modal-body">
                    <p>
                        Your wallet <strong>"${walletName}"</strong> has been created and your recovery phrase 
                        has been encrypted and stored in your browser.
                    </p>
                    <div class="alert alert-info small" style="background-color: rgba(73, 234, 203, 0.1); border-color: var(--kaspa-primary);">
                        <i class="bi bi-info-circle me-2"></i>
                        You can retrieve your mnemonic later using the "Retrieve Stored Mnemonic" button in the Wallet Manager section.
                    </div>
                </div>
                <div class="modal-footer" style="border-top-color: var(--kaspa-border);">
                    <button type="button" class="btn btn-kaspa" id="storageConfirmOkBtn">
                        <i class="bi bi-check-lg me-1"></i>Got It
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const okBtn = modal.querySelector('#storageConfirmOkBtn');
    okBtn.onclick = () => modal.remove();

    // Auto-dismiss after click or timeout
    setTimeout(() => {
        okBtn.focus();
    }, 100);
}
