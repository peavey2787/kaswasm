// walletManager.js - Wallet creation and management UI logic

import { log } from './log.js';
import { 
    getStoredWallets, 
    addWalletToList, 
    removeWalletFromList,
    storeMnemonic,
    retrieveMnemonic,
    hasMnemonicStored,
    getStorageInfo
} from './walletStorage.js';
import { KaspaClient } from '../wasm-wrapper/KaspaClient.js';
import { Wallet as KaspaWallet } from '../wasm-wrapper/Wallet.js';
import { resetFirstTimeSetupFlag } from './firstTimeSetup.js';

/**
 * Show a Bootstrap-styled password prompt modal.
 * @param {string} message - Message to display
 * @param {string} [title='Password Required'] - Modal title
 * @param {Object} [options] - Additional options
 * @param {boolean} [options.isDanger=false] - Show as danger/destructive action
 * @param {string} [options.confirmButtonText='Continue'] - Custom confirm button text
 * @param {string} [options.warningHtml] - Optional warning HTML to show above the password input
 * @returns {Promise<string|null>} - Resolves to the entered password or null if cancelled
 */
function showPasswordPrompt(message, title = 'Password Required', options = {}) {
    const { isDanger = false, confirmButtonText = 'Continue', warningHtml = '' } = options;
    
    return new Promise((resolve) => {
        // Remove any existing password modal
        const existing = document.getElementById('passwordPromptModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'passwordPromptModal';
        modal.className = 'modal d-block';
        modal.style.cssText = 'background: rgba(0,0,0,0.85); z-index: 11000;';
        modal.setAttribute('tabindex', '-1');

        const headerBg = isDanger 
            ? 'background-color: rgba(248, 81, 73, 0.15); border-bottom-color: #f85149;'
            : 'background-color: rgba(73, 234, 203, 0.1); border-bottom-color: var(--kaspa-border);';
        const headerColor = isDanger ? '#f85149' : 'var(--kaspa-primary)';
        const headerIcon = isDanger ? 'bi-exclamation-triangle-fill' : 'bi-shield-lock';
        const btnClass = isDanger ? 'btn-danger' : 'btn-kaspa';

        modal.innerHTML = `
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content" style="background-color: var(--kaspa-bg-card); border-color: ${isDanger ? '#f85149' : 'var(--kaspa-border)'};">
                    <div class="modal-header" style="${headerBg}">
                        <h5 class="modal-title" style="color: ${headerColor};">
                            <i class="bi ${headerIcon} me-2"></i>${title}
                        </h5>
                        <button type="button" class="btn-close btn-close-white" id="passwordPromptClose"></button>
                    </div>
                    <div class="modal-body">
                        ${warningHtml}
                        <p class="small text-muted mb-2">${message}</p>
                        <input type="password" class="form-control form-control-sm" id="passwordPromptInput" placeholder="Enter password" autocomplete="current-password" />
                    </div>
                    <div class="modal-footer" style="border-top-color: var(--kaspa-border);">
                        <button type="button" class="btn btn-outline-secondary btn-sm" id="passwordPromptCancel">Cancel</button>
                        <button type="button" class="btn ${btnClass} btn-sm" id="passwordPromptOk">
                            ${confirmButtonText}
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const input = modal.querySelector('#passwordPromptInput');
        const okBtn = modal.querySelector('#passwordPromptOk');
        const cancelBtn = modal.querySelector('#passwordPromptCancel');
        const closeBtn = modal.querySelector('#passwordPromptClose');

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

        // Do NOT close on background click for password prompts
        // Only explicit actions (OK/Cancel/X or Escape) will close the modal

        document.addEventListener('keydown', handleKeyDown);

        // Focus the input after render
        setTimeout(() => {
            input.focus();
        }, 0);
    });
}

/**
 * Render the wallet list in the UI.
 */
export function renderWalletList() {
    const container = document.getElementById('walletListContainer');
    if (!container) return;
    
    const wallets = getStoredWallets();
    const info = getStorageInfo();
    // Determine which wallet should be shown as active:
    // 1. A wallet explicitly requested to load (pending activation)
    // 2. The current wallet from this session
    // 3. The last wallet used (from localStorage)
    const pendingLoad = sessionStorage.getItem('kaspa_load_wallet');
    const activeFilename = pendingLoad ||
        sessionStorage.getItem('kaspa_current_wallet') ||
        localStorage.getItem('kaspa_last_wallet') || null;
    
    if (wallets.length === 0) {
        container.innerHTML = '<em class="text-muted">No wallets stored. Create a new wallet below.</em>';
        return;
    }
    
    let html = `<div class="small text-muted mb-2">
        <i class="bi bi-hdd me-1"></i>${info.walletCount} wallet(s) stored (${info.totalSize})
    </div>`;
    
    html += '<div class="table-responsive"><table class="table table-sm table-hover mb-0">';
    html += `<thead>
        <tr>
            <th>Wallet</th>
            <th class="d-none d-sm-table-cell">Network</th>
            <th>Mnemonic</th>
            <th class="d-none d-md-table-cell">Created</th>
            <th class="text-center">Actions</th>
        </tr>
    </thead><tbody>`;
    
    for (const wallet of wallets) {
        const createdDate = wallet.createdAt 
            ? new Date(wallet.createdAt).toLocaleDateString() 
            : 'Unknown';
        const mnemonicStatus = wallet.hasMnemonic 
            ? '<span class="badge bg-success"><i class="bi bi-lock-fill me-1"></i>Stored</span>' 
            : '<span class="badge bg-warning text-dark"><i class="bi bi-exclamation-triangle me-1"></i>Not saved</span>';
        const isActive = activeFilename && wallet.filename === activeFilename;
        const activeBadge = isActive 
            ? '<span class="badge bg-success me-1"><i class="bi bi-play-fill me-1"></i>Active</span>' 
            : '';
        const rowClass = isActive ? 'table-active' : '';
        const activateDisabledAttr = isActive ? 'disabled aria-disabled="true"' : '';
        
        html += `<tr class="${rowClass}">
            <td class="font-monospace small">${activeBadge}${wallet.filename}</td>
            <td class="d-none d-sm-table-cell">${wallet.network || 'Unknown'}</td>
            <td>${mnemonicStatus}</td>
            <td class="d-none d-md-table-cell small">${createdDate}</td>
            <td class="text-center">
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-kaspa wallet-load-btn" data-filename="${wallet.filename}" ${activateDisabledAttr}>
                        <i class="bi bi-box-arrow-in-right me-1"></i>Activate
                    </button>
                    <button class="btn btn-outline-kaspa wallet-edit-password-btn" data-filename="${wallet.filename}">
                        <i class="bi bi-key me-1"></i>Edit Password
                    </button>
                    <button class="btn btn-outline-danger wallet-delete-btn" data-filename="${wallet.filename}">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    }
    
    html += '</tbody></table></div>';
    container.innerHTML = html;
    
    // Attach event handlers
    container.querySelectorAll('.wallet-delete-btn').forEach(btn => {
        btn.onclick = () => handleDeleteWallet(btn.dataset.filename);
    });
    
    container.querySelectorAll('.wallet-load-btn').forEach(btn => {
        btn.onclick = () => handleLoadWallet(btn.dataset.filename);
    });

    container.querySelectorAll('.wallet-edit-password-btn').forEach(btn => {
        btn.onclick = () => handleEditWalletPassword(btn.dataset.filename);
    });
}

/**
 * Handle wallet deletion with full hard delete.
 * Removes wallet file from localStorage, plus clears all local references.
 * @param {string} filename 
 */
async function handleDeleteWallet(filename) {
    const wallets = getStoredWallets();
    const walletMeta = wallets.find(w => w.filename === filename);
    const network = walletMeta?.network || 'testnet-10';

    // Show deletion confirmation modal with warning and password prompt
    const warningHtml = `
        <div class="alert alert-danger mb-3" style="background-color: rgba(248, 81, 73, 0.15); border-color: #f85149;">
            <h6 class="alert-heading mb-2">
                <i class="bi bi-exclamation-triangle-fill me-2"></i>Permanent Deletion
            </h6>
            <p class="mb-2 small">This will permanently delete wallet <strong>"${filename}"</strong>:</p>
            <ul class="mb-0 small">
                <li>Remove wallet file from browser storage</li>
                <li>Delete any stored encrypted mnemonic</li>
                <li>Clear all wallet references</li>
            </ul>
            <p class="mt-2 mb-0 small text-danger"><strong>This action CANNOT be undone!</strong></p>
        </div>
    `;

    const password = await showPasswordPrompt(
        'Enter wallet password to confirm deletion:',
        'Delete Wallet',
        {
            isDanger: true,
            confirmButtonText: '<i class="bi bi-trash me-1"></i>Delete Permanently',
            warningHtml
        }
    );

    if (!password) {
        log('Wallet deletion cancelled.');
        return;
    }

    // Show progress
    log(`Deleting wallet "${filename}"...`);

    // Perform hard delete using the SDK
    try {
        const deleteResult = await KaspaWallet.deleteWallet(filename, password, network, {
            logger: { log, warn: console.warn, error: console.error }
        });

        if (!deleteResult.success && deleteResult.error) {
            // Check if it's a password error
            const errLower = (deleteResult.error || '').toLowerCase();
            if (errLower.includes('secret') || errLower.includes('password') || errLower.includes('decrypt')) {
                log(`Incorrect password for wallet "${filename}". Deletion cancelled.`);
                const { showResultModal } = await import('./resultModal.js');
                showResultModal(
                    'Deletion Failed',
                    `Incorrect password. The wallet "${filename}" was NOT deleted.`,
                    { type: 'error' }
                );
                return;
            }
            // Other error - log but continue with soft delete of local references
            log(`Warning: Hard delete encountered an error: ${deleteResult.error}`);
            log('Proceeding with removal of local references...');
        } else if (deleteResult.success) {
            log(`Hard delete successful. Removed ${deleteResult.deletedStorageKeys?.length || 0} storage entries.`);
        }
    } catch (err) {
        const errMsg = err?.message || String(err);
        log(`Warning: Hard delete failed: ${errMsg}`);
        log('Proceeding with removal of local references...');
    }

    // Remove from our local wallet list and encrypted mnemonic
    removeWalletFromList(filename);
    
    // Clear last wallet if this was it
    if (localStorage.getItem('kaspa_last_wallet') === filename) {
        localStorage.removeItem('kaspa_last_wallet');
    }

    // If this was the active wallet, clear session markers and wallet info UI
    const currentWallet = sessionStorage.getItem('kaspa_current_wallet');
    if (currentWallet === filename) {
        sessionStorage.removeItem('kaspa_current_wallet');
        sessionStorage.removeItem('kaspa_wallet_password');
        sessionStorage.removeItem('kaspa_load_wallet');
        sessionStorage.removeItem('kaspa_wallet_network');

        // Clear wallet info display (balance, address, etc.)
        const balanceEl = document.getElementById('balance');
        const addressEl = document.getElementById('receiveAddress');
        if (balanceEl) balanceEl.textContent = '-';
        if (addressEl) addressEl.textContent = '-';
    }

    // If there are no wallets left, reset first-time setup so the
    // welcome wizard shows again on next load instead of prompting
    // for the old wallet's password.
    const remaining = getStoredWallets();
    if (!remaining || remaining.length === 0) {
        resetFirstTimeSetupFlag();
        log('All wallets removed. First-time setup will be shown on next load.');
    }
    
    log(`Wallet "${filename}" permanently deleted.`);
    
    // Show success confirmation
    const { showResultModal } = await import('./resultModal.js');
    showResultModal(
        'Wallet Deleted',
        `Wallet "${filename}" has been permanently deleted.\n\nAll private key data has been removed from browser storage.`,
        { type: 'success' }
    );

    renderWalletList();
}

/**
 * Handle wallet password change for a given wallet filename.
 * This uses a temporary Wallet instance to change the on-disk secret.
 * @param {string} filename 
 */
async function handleEditWalletPassword(filename) {
    const wallets = getStoredWallets();
    const walletMeta = wallets.find(w => w.filename === filename);

    if (!walletMeta) {
        log(`Wallet "${filename}" not found.`);
        return;
    }

    const network = walletMeta.network || 'testnet-10';

    const newPassword = await showPasswordPrompt('Enter new password:', 'New Password');
    if (!newPassword) {
        log('Password change cancelled (no new password provided).');
        return;
    }

    const { showResultModal } = await import('./resultModal.js');

    let attempts = 0;

    // Keep prompting until correct password or user cancels
    while (true) {
        const oldPassword = await showPasswordPrompt(
            attempts === 0
                ? `Enter current password for wallet "${filename}":`
                : `Incorrect password. Please re-enter current password for wallet "${filename}".`,
            'Current Password'
        );

        if (!oldPassword) {
            log('Password change cancelled by user.');
            return;
        }

        try {
            log(`Changing password for wallet "${filename}" on network "${network}" (attempt ${attempts + 1})...`);
            const client = new KaspaClient();
            await client.connect(network);

            const tempWallet = new KaspaWallet(client);
            await tempWallet.open(filename, oldPassword);
            await tempWallet.changePassword(oldPassword, newPassword);
            await tempWallet.dispose();
            await client.dispose();

            log(`Password for wallet "${filename}" changed successfully.`);

            showResultModal(
                'Password Changed',
                `Password for wallet "${filename}" was changed successfully.\n\nMake sure to remember your new password!`,
                { type: 'success' }
            );
            return;
        } catch (err) {
            attempts++;
            log('Failed to change wallet password: ' + (err?.message || String(err)));

            // Loop again to prompt for password
            continue;
        }
    }
}

/**
 * Handle wallet loading - triggers app reload after setting up session storage.
 * Auto-switches network to match the wallet's network.
 * @param {string} filename 
 */
async function handleLoadWallet(filename) {
    const wallets = getStoredWallets();
    const wallet = wallets.find(w => w.filename === filename);
    
    if (!wallet) {
        log(`Wallet "${filename}" not found.`);
        return;
    }
    
    // Prompt for password using Bootstrap modal
    const password = await showPasswordPrompt(`Enter password for wallet "${filename}":`, 'Wallet Password');
    if (!password) {
        log('Wallet load cancelled.');
        return;
    }
    
    // Set the wallet filename in session storage for the init function to pick up
    sessionStorage.setItem('kaspa_load_wallet', filename);
    sessionStorage.setItem('kaspa_wallet_password', password);
    
    // Auto-switch network to match the wallet's network
    if (wallet.network) {
        sessionStorage.setItem('kaspa_wallet_network', wallet.network);
        const networkSelect = document.getElementById('networkSelect');
        if (networkSelect) {
            networkSelect.value = wallet.network;
        }
        log(`Auto-switching network to "${wallet.network}" to match wallet.`);
    }
    
    log(`Loading wallet "${filename}"...`);
    
    // Trigger reload
    window.location.reload();
}

/**
 * Show the mnemonic confirmation modal.
 * @param {string} mnemonic - The mnemonic to display
 * @param {string} filename - Wallet filename
 * @param {string} password - Wallet password
 * @param {Function} onComplete - Callback when user completes the flow
 */
export function showMnemonicModal(mnemonic, filename, password, onComplete) {
    // Remove existing modal if any
    const existingModal = document.getElementById('mnemonicModal');
    if (existingModal) existingModal.remove();
    
    const modal = document.createElement('div');
    modal.id = 'mnemonicModal';
    modal.className = 'modal d-block';
    modal.style.cssText = 'background: rgba(0,0,0,0.85); z-index: 10000;';
    modal.setAttribute('tabindex', '-1');
    
    const words = mnemonic.split(' ');
    const wordGrid = words.map((word, i) => 
        `<span class="badge bg-dark border border-secondary m-1 p-2 font-monospace">
            <small class="text-muted me-1">${i+1}.</small>${word}
        </span>`
    ).join('');
    
    modal.innerHTML = `
        <div class="modal-dialog modal-dialog-centered modal-lg">
            <div class="modal-content border-warning" style="background-color: var(--kaspa-bg-card);">
                <div class="modal-header border-warning bg-warning bg-opacity-10">
                    <h5 class="modal-title text-warning">
                        <i class="bi bi-exclamation-triangle-fill me-2"></i>SAVE YOUR MNEMONIC PHRASE
                    </h5>
                </div>
                <div class="modal-body">
                    <div class="alert alert-danger d-flex align-items-center" role="alert">
                        <i class="bi bi-shield-exclamation me-2 fs-4"></i>
                        <div>
                            <strong>This is the ONLY time you will see this mnemonic.</strong><br>
                            If you lose it, you CANNOT recover your wallet!
                        </div>
                    </div>
                    
                    <div class="p-3 rounded mb-3 text-center" style="background-color: var(--kaspa-bg-input);">
                        ${wordGrid}
                    </div>
                    
                    <div class="form-check p-3 rounded mb-2" style="background-color: rgba(73, 234, 203, 0.1); border: 1px solid rgba(73, 234, 203, 0.3);">
                        <input class="form-check-input" type="checkbox" id="mnemonicSaveToStorage">
                        <label class="form-check-label" for="mnemonicSaveToStorage">
                            <strong>Save encrypted mnemonic to browser storage</strong><br>
                            <small class="text-muted">
                                The mnemonic will be encrypted with your wallet password and stored locally.
                                You can retrieve it later, but anyone with access to this browser and your password can see it.
                            </small>
                        </label>
                    </div>
                    
                    <div class="form-check p-3 rounded" style="background-color: rgba(248, 81, 73, 0.1); border: 1px solid rgba(248, 81, 73, 0.3);">
                        <input class="form-check-input" type="checkbox" id="mnemonicConfirmWritten">
                        <label class="form-check-label" for="mnemonicConfirmWritten">
                            <strong>I have written down my mnemonic phrase</strong><br>
                            <small class="text-muted">
                                I understand that if I lose my mnemonic and don't save it to storage, 
                                my wallet and funds will be lost forever.
                            </small>
                        </label>
                    </div>
                </div>
                <div class="modal-footer border-secondary">
                    <button id="mnemonicCopyBtn" class="btn btn-outline-primary">
                        <i class="bi bi-clipboard me-1"></i>Copy to Clipboard
                    </button>
                    <button id="mnemonicContinueBtn" class="btn btn-secondary" disabled>
                        Continue
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const saveCheckbox = document.getElementById('mnemonicSaveToStorage');
    const confirmCheckbox = document.getElementById('mnemonicConfirmWritten');
    const continueBtn = document.getElementById('mnemonicContinueBtn');
    const copyBtn = document.getElementById('mnemonicCopyBtn');
    
    function updateContinueButton() {
        const canContinue = saveCheckbox.checked || confirmCheckbox.checked;
        continueBtn.disabled = !canContinue;
        continueBtn.className = canContinue ? 'btn btn-kaspa' : 'btn btn-secondary';
    }
    
    saveCheckbox.onchange = updateContinueButton;
    confirmCheckbox.onchange = updateContinueButton;
    
    if (copyBtn) {
        attachMnemonicCopyHandler(copyBtn, mnemonic);
    }
    
    continueBtn.onclick = async () => {
        // Store mnemonic if user chose to
        if (saveCheckbox.checked) {
            await storeMnemonic(filename, mnemonic, password);
            log('Mnemonic saved to encrypted storage.');
        } else {
            log('Mnemonic NOT saved. Make sure you have written it down!');
        }
        
        modal.remove();
        
        if (onComplete) {
            onComplete(saveCheckbox.checked);
        }
    };
}

/**
 * Attach a standardized copy-to-clipboard handler for mnemonic phrases.
 * Ensures consistent UX (success state, labels, classes) across all mnemonic modals.
 * @param {HTMLButtonElement} button
 * @param {string} mnemonic
 */
function attachMnemonicCopyHandler(button, mnemonic) {
    const originalHtml = button.innerHTML;
    const originalClasses = button.className;

    button.onclick = async () => {
        try {
            await navigator.clipboard.writeText(mnemonic);
            button.innerHTML = '<i class="bi bi-check-lg me-1"></i>Copied!';
            button.classList.remove('btn-outline-primary', 'btn-outline-kaspa');
            button.classList.add('btn-success');
            setTimeout(() => {
                button.innerHTML = originalHtml;
                button.className = originalClasses;
            }, 2000);
        } catch (err) {
            log('Failed to copy mnemonic: ' + (err?.message || String(err)));
        }
    };
}

/**
 * Show dialog to retrieve stored mnemonic.
 * @param {string} filename - Wallet filename
 */
export async function showRetrieveMnemonicDialog(filename) {
    if (!hasMnemonicStored(filename)) {
        log('No mnemonic stored for this wallet.');
        log('The mnemonic is only available if you chose to save it when creating the wallet.');
        return;
    }
    
    const password = await showPasswordPrompt('Enter your wallet password to decrypt the mnemonic:', 'Decrypt Mnemonic');
    if (!password) return;
    
    const mnemonic = await retrieveMnemonic(filename, password);
    
    if (!mnemonic) {
        log('Failed to decrypt mnemonic. Wrong password?');
        return;
    }
    
    // Show mnemonic in a Bootstrap modal
    const modal = document.createElement('div');
    modal.className = 'modal d-block';
    modal.style.cssText = 'background: rgba(0,0,0,0.85); z-index: 10000;';
    modal.setAttribute('tabindex', '-1');
    
    const words = mnemonic.split(' ');
    const wordGrid = words.map((word, i) => 
        `<span class="badge bg-dark border border-secondary m-1 p-2 font-monospace">
            <small class="text-muted me-1">${i+1}.</small>${word}
        </span>`
    ).join('');
    
    modal.innerHTML = `
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content border-warning" style="background-color: var(--kaspa-bg-card);">
                <div class="modal-header border-secondary">
                    <h5 class="modal-title text-warning">
                        <i class="bi bi-key-fill me-2"></i>Your Mnemonic Phrase
                    </h5>
                    <button type="button" class="btn-close btn-close-white" id="closeRetrieveModal"></button>
                </div>
                <div class="modal-body">
                    <div class="p-3 rounded mb-3 text-center" style="background-color: var(--kaspa-bg-input);">
                        ${wordGrid}
                    </div>
                    <div class="alert alert-danger d-flex align-items-center mb-2" role="alert">
                        <i class="bi bi-shield-exclamation me-2"></i>
                        <small>Never share this with anyone!</small>
                    </div>
                    <div class="d-flex justify-content-between align-items-center mt-2 small text-muted">
                        <span>Words are in the correct order.</span>
                        <button type="button" class="btn btn-outline-primary btn-sm" id="copyRetrieveMnemonicBtn">
                            <i class="bi bi-clipboard me-1"></i>Copy Phrase
                        </button>
                    </div>
                </div>
                <div class="modal-footer border-secondary">
                    <button type="button" class="btn btn-kaspa" id="closeRetrieveModalBtn">
                        <i class="bi bi-check-lg me-1"></i>Close
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const closeModal = () => modal.remove();
    
    const closeIconBtn = document.getElementById('closeRetrieveModal');
    const closeFooterBtn = document.getElementById('closeRetrieveModalBtn');
    const copyBtn = document.getElementById('copyRetrieveMnemonicBtn');

    if (closeIconBtn) closeIconBtn.onclick = closeModal;
    if (closeFooterBtn) closeFooterBtn.onclick = closeModal;

    if (copyBtn) {
        // Reuse the same copy UX as the creation mnemonic modal
        attachMnemonicCopyHandler(copyBtn, mnemonic);
    }
    
    // Close on background click
    modal.onclick = (e) => {
        if (e.target === modal) closeModal();
    };
}

/**
 * Initialize wallet manager UI.
 */
export function initWalletManagerUI() {
    renderWalletList();
    
    // Wire up create wallet button
    const createBtn = document.getElementById('createNewWalletBtn');
    if (createBtn) {
        createBtn.onclick = handleCreateNewWallet;
    }

    // Wire up import wallet button
    const importBtn = document.getElementById('importWalletBtn');
    if (importBtn) {
        importBtn.onclick = handleImportWallet;
    }
    
    // Wire up retrieve mnemonic button
    const retrieveBtn = document.getElementById('retrieveMnemonicBtn');
    if (retrieveBtn) {
        retrieveBtn.onclick = () => {
            const filename = sessionStorage.getItem('kaspa_current_wallet') || 'wallet-browser-demo';
            showRetrieveMnemonicDialog(filename);
        };
    }
}

/**
 * Handle new wallet creation - shows modal for wallet details.
 */
async function handleCreateNewWallet() {
    const config = await showCreateWalletModal();
    if (!config) {
        log('Wallet creation cancelled.');
        return;
    }

    const networkSelect = document.getElementById('networkSelect');
    const network = networkSelect?.value || 'testnet-10';

    // Store the creation info for initWallet to pick up
    sessionStorage.setItem('kaspa_create_wallet', config.walletName);
    sessionStorage.setItem('kaspa_wallet_password', config.password);
    sessionStorage.setItem('kaspa_wallet_network', network);
    sessionStorage.setItem('kaspa_storage_preference', config.storagePreference);

    log(`Creating new wallet "${config.walletName}"...`);

    // Reload to trigger wallet creation
    window.location.reload();
}

/**
 * Show the create wallet modal.
 * @returns {Promise<{ walletName: string, password: string, storagePreference: string } | null>}
 */
function showCreateWalletModal() {
    return new Promise((resolve) => {
        const existing = document.getElementById('createWalletModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'createWalletModal';
        modal.className = 'modal d-block';
        modal.style.cssText = 'background: rgba(0,0,0,0.9); z-index: 11000;';
        modal.setAttribute('tabindex', '-1');

        modal.innerHTML = `
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content" style="background-color: var(--kaspa-bg-card); border: 1px solid var(--kaspa-primary);">
                    <div class="modal-header" style="background-color: rgba(73, 234, 203, 0.1); border-bottom-color: var(--kaspa-border);">
                        <h5 class="modal-title" style="color: var(--kaspa-primary);">
                            <i class="bi bi-plus-circle me-2"></i>Create New Wallet
                        </h5>
                        <button type="button" class="btn-close btn-close-white" id="createWalletClose"></button>
                    </div>
                    <div class="modal-body">
                        <!-- Wallet Name -->
                        <div class="mb-3">
                            <label for="createWalletName" class="form-label small">
                                <i class="bi bi-tag me-1"></i>Wallet Name
                            </label>
                            <input type="text" class="form-control form-control-sm" id="createWalletName" 
                                   placeholder="my-wallet" value="my-wallet">
                            <div class="form-text">A unique name for this wallet.</div>
                        </div>

                        <!-- Password -->
                        <div class="mb-3">
                            <label for="createWalletPassword" class="form-label small">
                                <i class="bi bi-lock me-1"></i>Password
                            </label>
                            <input type="password" class="form-control form-control-sm" id="createWalletPassword" 
                                   placeholder="Enter a password" autocomplete="new-password">
                            <div class="form-text">This password will encrypt your wallet.</div>
                        </div>

                        <!-- Confirm Password -->
                        <div class="mb-3">
                            <label for="createWalletPasswordConfirm" class="form-label small">
                                <i class="bi bi-lock-fill me-1"></i>Confirm Password
                            </label>
                            <input type="password" class="form-control form-control-sm" id="createWalletPasswordConfirm" 
                                   placeholder="Re-enter password" autocomplete="new-password">
                        </div>

                        <!-- Storage Preference -->
                        <div class="mb-3">
                            <label class="form-label small">
                                <i class="bi bi-shield-lock me-1"></i>Recovery Phrase Storage
                            </label>
                            <div class="p-2 rounded" style="background-color: var(--kaspa-bg-input);">
                                <div class="form-check mb-2">
                                    <input class="form-check-input" type="radio" name="createStoragePreference" 
                                           id="createPrefShowMnemonic" value="show_mnemonic" checked>
                                    <label class="form-check-label small" for="createPrefShowMnemonic">
                                        <strong>Show Mnemonic</strong> - Display to save manually (most secure)
                                    </label>
                                </div>
                                <div class="form-check">
                                    <input class="form-check-input" type="radio" name="createStoragePreference" 
                                           id="createPrefStoreEncrypted" value="store_encrypted">
                                    <label class="form-check-label small" for="createPrefStoreEncrypted">
                                        <strong>Store Encrypted</strong> - Save in browser storage (convenient)
                                    </label>
                                </div>
                            </div>
                        </div>

                        <!-- Error Display -->
                        <div id="createErrorMsg" class="alert alert-danger small d-none mb-0" 
                             style="background-color: rgba(248, 81, 73, 0.15); border-color: #f85149;">
                        </div>
                    </div>
                    <div class="modal-footer" style="border-top-color: var(--kaspa-border);">
                        <button type="button" class="btn btn-outline-secondary btn-sm" id="createWalletCancel">Cancel</button>
                        <button type="button" class="btn btn-kaspa btn-sm" id="createWalletSubmit">
                            <i class="bi bi-plus-lg me-1"></i>Create Wallet
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const walletNameInput = modal.querySelector('#createWalletName');
        const passwordInput = modal.querySelector('#createWalletPassword');
        const passwordConfirmInput = modal.querySelector('#createWalletPasswordConfirm');
        const submitBtn = modal.querySelector('#createWalletSubmit');
        const cancelBtn = modal.querySelector('#createWalletCancel');
        const closeBtn = modal.querySelector('#createWalletClose');
        const errorMsg = modal.querySelector('#createErrorMsg');

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

        const validate = () => {
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

            if (walletName.length < 3) {
                showError('Wallet name must be at least 3 characters.');
                walletNameInput.focus();
                return null;
            }

            // Check if wallet exists
            const wallets = getStoredWallets();
            if (wallets.find(w => w.filename === walletName)) {
                showError(`Wallet "${walletName}" already exists. Choose a different name.`);
                walletNameInput.focus();
                return null;
            }

            if (!password) {
                showError('Please enter a password.');
                passwordInput.focus();
                return null;
            }

            if (password.length < 4) {
                showError('Password must be at least 4 characters.');
                passwordInput.focus();
                return null;
            }

            if (password !== passwordConfirm) {
                showError('Passwords do not match.');
                passwordConfirmInput.focus();
                return null;
            }

            const storagePref = modal.querySelector('input[name="createStoragePreference"]:checked').value;

            return {
                walletName,
                password,
                storagePreference: storagePref
            };
        };

        const submit = () => {
            const config = validate();
            if (config) {
                cleanup();
                resolve(config);
            }
        };

        const cancel = () => {
            cleanup();
            resolve(null);
        };

        submitBtn.onclick = submit;
        cancelBtn.onclick = cancel;
        closeBtn.onclick = cancel;

        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                submit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
            }
        });

        setTimeout(() => walletNameInput.focus(), 100);
    });
}

/**
 * Show the import wallet modal.
 * @returns {Promise<{ walletName: string, password: string, mnemonic: string } | null>}
 */
export function showImportWalletModal() {
    return new Promise((resolve) => {
        // Remove any existing modal
        const existing = document.getElementById('importWalletModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'importWalletModal';
        modal.className = 'modal d-block';
        modal.style.cssText = 'background: rgba(0,0,0,0.9); z-index: 11000;';
        modal.setAttribute('tabindex', '-1');

        modal.innerHTML = `
            <div class="modal-dialog modal-dialog-centered modal-lg">
                <div class="modal-content" style="background-color: var(--kaspa-bg-card); border: 1px solid var(--kaspa-primary);">
                    <div class="modal-header" style="background-color: rgba(73, 234, 203, 0.1); border-bottom-color: var(--kaspa-border);">
                        <h5 class="modal-title" style="color: var(--kaspa-primary);">
                            <i class="bi bi-box-arrow-in-down me-2"></i>Import Wallet from Mnemonic
                        </h5>
                        <button type="button" class="btn-close btn-close-white" id="importWalletClose"></button>
                    </div>
                    <div class="modal-body">
                        <div class="alert alert-info small mb-3" style="background-color: rgba(73, 234, 203, 0.1); border-color: var(--kaspa-primary);">
                            <i class="bi bi-info-circle me-2"></i>
                            Enter your 12 or 24-word recovery phrase to import an existing wallet.
                        </div>

                        <!-- Wallet Name -->
                        <div class="mb-3">
                            <label for="importWalletName" class="form-label small">
                                <i class="bi bi-tag me-1"></i>Wallet Name
                            </label>
                            <input type="text" class="form-control form-control-sm" id="importWalletName" 
                                   placeholder="imported-wallet" value="imported-wallet">
                            <div class="form-text">A unique name for this imported wallet.</div>
                        </div>

                        <!-- Password -->
                        <div class="mb-3">
                            <label for="importWalletPassword" class="form-label small">
                                <i class="bi bi-lock me-1"></i>New Password
                            </label>
                            <input type="password" class="form-control form-control-sm" id="importWalletPassword" 
                                   placeholder="Enter a password" autocomplete="new-password">
                            <div class="form-text">This password will encrypt your imported wallet.</div>
                        </div>

                        <!-- Confirm Password -->
                        <div class="mb-3">
                            <label for="importWalletPasswordConfirm" class="form-label small">
                                <i class="bi bi-lock-fill me-1"></i>Confirm Password
                            </label>
                            <input type="password" class="form-control form-control-sm" id="importWalletPasswordConfirm" 
                                   placeholder="Re-enter password" autocomplete="new-password">
                        </div>

                        <!-- Mnemonic Input -->
                        <div class="mb-3">
                            <label for="importWalletMnemonic" class="form-label small">
                                <i class="bi bi-key me-1"></i>Recovery Phrase (Mnemonic)
                            </label>
                            <textarea class="form-control font-monospace" id="importWalletMnemonic" 
                                      rows="4" placeholder="Enter your 12 or 24-word recovery phrase, separated by spaces..."
                                      style="font-size: 0.85rem;"></textarea>
                            <div class="form-text d-flex justify-content-between">
                                <span>Enter words separated by spaces.</span>
                                <span id="importWordCount" class="text-muted">0 words</span>
                            </div>
                        </div>

                        <!-- Storage Preference -->
                        <div class="mb-3">
                            <label class="form-label small">
                                <i class="bi bi-shield-lock me-1"></i>Recovery Phrase Storage
                            </label>
                            <div class="p-2 rounded" style="background-color: var(--kaspa-bg-input);">
                                <div class="form-check mb-2">
                                    <input class="form-check-input" type="radio" name="importStoragePreference" 
                                           id="importPrefNoSave" value="no_save" checked>
                                    <label class="form-check-label small" for="importPrefNoSave">
                                        <strong>Don't Save</strong> - I already have my recovery phrase backed up securely
                                    </label>
                                </div>
                                <div class="form-check">
                                    <input class="form-check-input" type="radio" name="importStoragePreference" 
                                           id="importPrefStoreEncrypted" value="store_encrypted">
                                    <label class="form-check-label small" for="importPrefStoreEncrypted">
                                        <strong>Store Encrypted</strong> - Save phrase in browser storage (password-protected)
                                    </label>
                                </div>
                            </div>
                            <div class="form-text">Choose whether to save the recovery phrase in browser storage.</div>
                        </div>

                        <!-- Security Warning -->
                        <div class="alert alert-warning small mb-0" style="background-color: rgba(255, 193, 7, 0.15); border-color: #ffc107;">
                            <i class="bi bi-shield-exclamation me-2"></i>
                            <strong>Security:</strong> Never share your recovery phrase. Anyone with access to it can steal your funds.
                        </div>

                        <!-- Error Display -->
                        <div id="importErrorMsg" class="alert alert-danger small d-none mt-3 mb-0" 
                             style="background-color: rgba(248, 81, 73, 0.15); border-color: #f85149;">
                        </div>
                    </div>
                    <div class="modal-footer" style="border-top-color: var(--kaspa-border);">
                        <button type="button" class="btn btn-outline-secondary btn-sm" id="importWalletCancel">Cancel</button>
                        <button type="button" class="btn btn-kaspa btn-sm" id="importWalletSubmit">
                            <i class="bi bi-box-arrow-in-down me-1"></i>Import Wallet
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const walletNameInput = modal.querySelector('#importWalletName');
        const passwordInput = modal.querySelector('#importWalletPassword');
        const passwordConfirmInput = modal.querySelector('#importWalletPasswordConfirm');
        const mnemonicInput = modal.querySelector('#importWalletMnemonic');
        const wordCountEl = modal.querySelector('#importWordCount');
        const submitBtn = modal.querySelector('#importWalletSubmit');
        const cancelBtn = modal.querySelector('#importWalletCancel');
        const closeBtn = modal.querySelector('#importWalletClose');
        const errorMsg = modal.querySelector('#importErrorMsg');

        const showError = (msg) => {
            errorMsg.textContent = msg;
            errorMsg.classList.remove('d-none');
        };

        const hideError = () => {
            errorMsg.classList.add('d-none');
        };

        // Update word count as user types
        mnemonicInput.addEventListener('input', () => {
            const words = mnemonicInput.value.trim().split(/\s+/).filter(w => w.length > 0);
            const count = words.length;
            wordCountEl.textContent = `${count} word${count !== 1 ? 's' : ''}`;
            
            // Color code based on valid counts
            if ([12, 15, 18, 21, 24].includes(count)) {
                wordCountEl.classList.remove('text-muted', 'text-danger');
                wordCountEl.classList.add('text-success');
            } else if (count > 0) {
                wordCountEl.classList.remove('text-muted', 'text-success');
                wordCountEl.classList.add('text-danger');
            } else {
                wordCountEl.classList.remove('text-success', 'text-danger');
                wordCountEl.classList.add('text-muted');
            }
        });

        const cleanup = () => {
            modal.remove();
        };

        const validate = () => {
            hideError();

            const walletName = walletNameInput.value.trim();
            const password = passwordInput.value;
            const passwordConfirm = passwordConfirmInput.value;
            const mnemonic = mnemonicInput.value.trim().toLowerCase();

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

            // Check if wallet name already exists
            const wallets = getStoredWallets();
            if (wallets.find(w => w.filename === walletName)) {
                showError(`Wallet "${walletName}" already exists. Choose a different name.`);
                walletNameInput.focus();
                return null;
            }

            if (!password) {
                showError('Please enter a password.');
                passwordInput.focus();
                return null;
            }

            if (password.length < 4) {
                showError('Password must be at least 4 characters.');
                passwordInput.focus();
                return null;
            }

            if (password !== passwordConfirm) {
                showError('Passwords do not match.');
                passwordConfirmInput.focus();
                return null;
            }

            if (!mnemonic) {
                showError('Please enter your recovery phrase.');
                mnemonicInput.focus();
                return null;
            }

            const words = mnemonic.split(/\s+/).filter(w => w.length > 0);
            if (![12, 15, 18, 21, 24].includes(words.length)) {
                showError(`Invalid word count: ${words.length}. Expected 12, 15, 18, 21, or 24 words.`);
                mnemonicInput.focus();
                return null;
            }

            // Get storage preference
            const storagePreferenceRadio = modal.querySelector('input[name="importStoragePreference"]:checked');
            const storagePreference = storagePreferenceRadio?.value || 'no_save';

            return {
                walletName,
                password,
                mnemonic: words.join(' '),
                storagePreference
            };
        };

        const submit = () => {
            const config = validate();
            if (config) {
                cleanup();
                resolve(config);
            }
        };

        const cancel = () => {
            cleanup();
            resolve(null);
        };

        submitBtn.onclick = submit;
        cancelBtn.onclick = cancel;
        closeBtn.onclick = cancel;

        // Handle keyboard
        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target !== mnemonicInput) {
                e.preventDefault();
                submit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
            }
        });

        // Focus wallet name
        setTimeout(() => walletNameInput.focus(), 100);
    });
}

/**
 * Handle import wallet button click.
 */
async function handleImportWallet() {
    const config = await showImportWalletModal();
    if (!config) {
        log('Wallet import cancelled.');
        return;
    }

    const networkSelect = document.getElementById('networkSelect');
    const network = networkSelect?.value || 'testnet-10';

    // Store import info for initWallet to pick up
    sessionStorage.setItem('kaspa_import_wallet', config.walletName);
    sessionStorage.setItem('kaspa_wallet_password', config.password);
    sessionStorage.setItem('kaspa_wallet_mnemonic', config.mnemonic);
    sessionStorage.setItem('kaspa_wallet_network', network);
    sessionStorage.setItem('kaspa_import_storage_preference', config.storagePreference);

    log(`Importing wallet "${config.walletName}"...`);

    // Reload to trigger wallet import
    window.location.reload();
}

/**
 * Get wallet import info from session storage.
 * Note: Does NOT clear kaspa_wallet_password - that's needed later for mnemonic storage.
 * @returns {{ filename: string, password: string, mnemonic: string, network: string, storagePreference: string }|null}
 */
export function getWalletImportInfo() {
    const filename = sessionStorage.getItem('kaspa_import_wallet');
    const password = sessionStorage.getItem('kaspa_wallet_password');
    const mnemonic = sessionStorage.getItem('kaspa_wallet_mnemonic');
    const network = sessionStorage.getItem('kaspa_wallet_network');
    const storagePreference = sessionStorage.getItem('kaspa_import_storage_preference') || 'no_save';

    if (!filename || !mnemonic) return null;

    // Clear after reading (mnemonic is sensitive!)
    // Note: Don't clear password yet - needed for mnemonic storage if user chose store_encrypted
    sessionStorage.removeItem('kaspa_import_wallet');
    sessionStorage.removeItem('kaspa_wallet_mnemonic');
    sessionStorage.removeItem('kaspa_wallet_network');
    sessionStorage.removeItem('kaspa_import_storage_preference');

    return { filename, password, mnemonic, network, storagePreference };
}

/**
 * Get wallet creation info from session storage.
 * Note: Does NOT clear kaspa_wallet_password - that's needed later for mnemonic storage.
 * @returns {{ filename: string, password: string, network: string }|null}
 */
export function getWalletCreationInfo() {
    const filename = sessionStorage.getItem('kaspa_create_wallet');
    const password = sessionStorage.getItem('kaspa_wallet_password');
    const network = sessionStorage.getItem('kaspa_wallet_network');
    
    if (!filename) return null;
    
    // Clear creation-specific keys after reading, but NOT the password
    // (password is needed for mnemonic storage after wallet creation)
    sessionStorage.removeItem('kaspa_create_wallet');
    sessionStorage.removeItem('kaspa_wallet_network');
    
    return { filename, password, network };
}

/**
 * Get wallet load info from session storage.
 * @returns {{ filename: string, password: string }|null}
 */
export function getWalletLoadInfo() {
    const filename = sessionStorage.getItem('kaspa_load_wallet');
    const password = sessionStorage.getItem('kaspa_wallet_password');
    
    if (!filename) return null;
    
    // Clear after reading
    sessionStorage.removeItem('kaspa_load_wallet');
    sessionStorage.removeItem('kaspa_wallet_password');
    
    return { filename, password: password || 'abc' };
}
