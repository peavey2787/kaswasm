// app.js - Application entry point for Kaspa WASM Browser Demo

console.log('Main app script loaded');

/**
 * Handle errors during wallet initialization in a user-friendly way.
 * Clears active wallet markers when the user cancels password entry so
 * no wallet is treated as active and the UI stays consistent.
 * @param {any} err
 * @param {Function} log
 * @param {Function} renderWalletList
 */
function handleWalletInitError(err, log, renderWalletList) {
  const msg = err?.message || String(err);

  if (msg.includes('Wallet open cancelled')) {
    log('[Wallet] Open cancelled by user. No wallet is active.');

    // Clear active wallet markers
    sessionStorage.removeItem('kaspa_current_wallet');
    sessionStorage.removeItem('kaspa_wallet_password');
    sessionStorage.removeItem('kaspa_load_wallet');
    localStorage.removeItem('kaspa_last_wallet');

    // Clear wallet info display
    const balanceEl = document.getElementById('balance');
    const addressEl = document.getElementById('receiveAddress');
    if (balanceEl) balanceEl.textContent = '-';
    if (addressEl) addressEl.textContent = '-';

    // Re-render wallet list to remove any active badge
    renderWalletList();
    return;
  }

  // Log other init errors without breaking the app
  log('[Wallet] Initialization failed: ' + msg);
}

/**
 * Show a network mismatch warning modal.
 * @param {string} walletFilename - Current wallet filename
 * @param {string} walletNetwork - Wallet's network
 * @param {string} selectedNetwork - User-selected network
 * @param {Function} onRevert - Callback to revert network selection
 */
function showNetworkMismatchWarning(walletFilename, walletNetwork, selectedNetwork, onRevert) {
    // Remove existing modal if any
    const existing = document.getElementById('networkMismatchModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'networkMismatchModal';
    modal.className = 'modal d-block';
    modal.style.cssText = 'background: rgba(0,0,0,0.9); z-index: 12000;';
    modal.setAttribute('tabindex', '-1');

    modal.innerHTML = `
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content" style="background-color: var(--kaspa-bg-card); border: 2px solid #f85149;">
                <div class="modal-header" style="background-color: rgba(248, 81, 73, 0.2); border-bottom-color: #f85149;">
                    <h5 class="modal-title" style="color: #f85149;">
                        <i class="bi bi-exclamation-triangle-fill me-2"></i>Network Mismatch Warning
                    </h5>
                </div>
                <div class="modal-body">
                    <div class="alert alert-danger mb-3" style="background-color: rgba(248, 81, 73, 0.15); border-color: #f85149;">
                        <h6 class="alert-heading mb-2">
                            <i class="bi bi-shield-exclamation me-2"></i>Wallet Incompatible with Selected Network
                        </h6>
                        <p class="mb-0">
                            The current wallet <strong>"${walletFilename}"</strong> was created for 
                            <span class="badge bg-success">${walletNetwork}</span> but you selected 
                            <span class="badge bg-danger">${selectedNetwork}</span>.
                        </p>
                    </div>
                    <p class="text-muted small mb-3">
                        Wallets are network-specific. You cannot use a wallet created for one network on a different network.
                    </p>
                    <div class="p-3 rounded" style="background-color: var(--kaspa-bg-input);">
                        <p class="mb-2 small"><strong>You have two options:</strong></p>
                        <ol class="mb-0 small">
                            <li class="mb-2">
                                <strong>Create a new wallet</strong> for ${selectedNetwork} using the Wallet Manager section.
                            </li>
                            <li>
                                <strong>Activate a different wallet</strong> that was created for ${selectedNetwork}, or revert to ${walletNetwork}.
                            </li>
                        </ol>
                    </div>
                </div>
                <div class="modal-footer" style="border-top-color: var(--kaspa-border);">
                    <button type="button" class="btn btn-kaspa btn-sm" id="networkMismatchRevert">
                        <i class="bi bi-arrow-counterclockwise me-1"></i>Revert to ${walletNetwork}
                    </button>
                    <button type="button" class="btn btn-outline-danger btn-sm" id="networkMismatchDismiss">
                        <i class="bi bi-x-lg me-1"></i>Dismiss (No Wallet)
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const revertBtn = modal.querySelector('#networkMismatchRevert');
    const dismissBtn = modal.querySelector('#networkMismatchDismiss');

    revertBtn.onclick = () => {
        modal.remove();
        onRevert();
    };

    dismissBtn.onclick = () => {
        modal.remove();
        // Clear active wallet markers
        sessionStorage.removeItem('kaspa_current_wallet');
        sessionStorage.removeItem('kaspa_wallet_password');
        localStorage.removeItem('kaspa_last_wallet');
        // Clear wallet info display
        const balanceEl = document.getElementById('balance');
        const addressEl = document.getElementById('receiveAddress');
        if (balanceEl) balanceEl.textContent = '-';
        if (addressEl) addressEl.textContent = '-';
        // Re-render wallet list to remove active badge
        import('./walletManager.js').then(m => m.renderWalletList());
    };
}

window.addEventListener('DOMContentLoaded', async () => {
  console.log('DOMContentLoaded event fired');

  const { log, clearLog } = await import('./log.js');
  const { initializeWallet, getInstances, disposeAll } = await import('./initWallet.js');
  const {
    sendKaspaToSelf,
    listTransactions,
    transferKaspaSelf,
    getTransactionByIndex,
    getUtxosForAddresses,
    getPayloadByTxId,
    getFeeEstimate,
    createNewAddress,
    listAllAddresses,
    showMnemonic,
  } = await import('./walletActions.js');
  const { getLatestBlueScore } = await import('./events.js');
  const { initWalletManagerUI, renderWalletList } = await import('./walletManager.js');
  const { getStoredWallets } = await import('./walletStorage.js');
  const { initBlockScannerUI, resetScanner, disposeBlockScanner } = await import('./blockScannerUI.js');
  const { 
    isFirstTimeSetupNeeded, 
    showFirstTimeSetupWizard, 
    handleFirstTimeSetup,
    markFirstTimeSetupComplete,
    StoragePreference
  } = await import('./firstTimeSetup.js');
  const { 
    showLoadingScreen, 
    hideLoadingScreen, 
    updateLoadingStatus, 
    progressToStep 
  } = await import('./loadingScreen.js');

  log('Log system initialized!');

  // Initialize the wallet manager UI
  initWalletManagerUI();
  renderWalletList();

  // Initialize the block scanner UI
  initBlockScannerUI();

  let firstAccount = null;
  let lastBalance = null;
  
    // Determine initial network:
    // 1. Explicit override from a wallet activation in this session
    // 2. Network associated with the last-used wallet in storage
    // 3. Fallback to testnet-10
    const networkOverride = sessionStorage.getItem('kaspa_wallet_network');
    let currentNetwork = networkOverride || 'testnet-10';

    if (!networkOverride) {
      const lastWalletName = localStorage.getItem('kaspa_last_wallet');
      if (lastWalletName) {
        const wallets = getStoredWallets();
        const lastWalletMeta = wallets.find(w => w.filename === lastWalletName);
        if (lastWalletMeta && lastWalletMeta.network) {
          currentNetwork = lastWalletMeta.network;
        }
      }
    }

    const networkSelect = document.getElementById('networkSelect');
    if (networkSelect) {
      networkSelect.value = currentNetwork;
    }

    if (networkOverride) {
      // Clear the one-time override after applying it
      sessionStorage.removeItem('kaspa_wallet_network');
    }

  function setFirstAccount(account) {
    firstAccount = account;
  }
  function setLastBalance(balance) {
    lastBalance = balance;
  }

  // Network switch handler with wallet compatibility check
  networkSelect.addEventListener('change', async (e) => {
    const newNetwork = e.target.value;
    
    // Check if current wallet is compatible with the new network
    const currentWalletFilename = sessionStorage.getItem('kaspa_current_wallet') || 
                                   localStorage.getItem('kaspa_last_wallet');
    
    if (currentWalletFilename) {
        const wallets = getStoredWallets();
        const currentWallet = wallets.find(w => w.filename === currentWalletFilename);
        
        if (currentWallet && currentWallet.network && currentWallet.network !== newNetwork) {
            // Network mismatch - show warning and don't proceed
            log(`\n[Network] Warning: Wallet "${currentWalletFilename}" is for ${currentWallet.network}, not ${newNetwork}.`);
            
            showNetworkMismatchWarning(
                currentWalletFilename,
                currentWallet.network,
                newNetwork,
                () => {
                    // Revert network selection
                    networkSelect.value = currentWallet.network;
                    log(`[Network] Reverted to ${currentWallet.network}.`);
                }
            );
            return; // Don't initialize wallet
        }
    }
    
    currentNetwork = newNetwork;
    log(`\n[Network] Switching to ${currentNetwork}...`);
    
    // Show loading screen for network switch
    showLoadingScreen({
      title: 'Switching Network',
      status: `Connecting to ${currentNetwork}...`
    });
    progressToStep('init', []);
    
    // Reset the block scanner before reinitializing (events instance will change)
    resetScanner();
    
    try {
      updateLoadingStatus('Reconnecting wallet...');
      progressToStep('connect', ['init']);
      
      await initializeWallet(currentNetwork, setFirstAccount, setLastBalance);
      
      updateLoadingStatus('Network ready!');
      progressToStep('wallet', ['init', 'connect']);
      
      // Re-render wallet list so the active wallet badge reflects any changes
      renderWalletList();
      
      await hideLoadingScreen();
    } catch (err) {
      await hideLoadingScreen();
      handleWalletInitError(err, log, renderWalletList);
    }
  });

  // Send KAS to self
  document.getElementById('sendBtn').onclick = async () => {
    const amountEl = document.getElementById('amountInput');
    const amount = amountEl ? amountEl.value.trim() || '1.567' : '1.567';
    const payload = document.getElementById('payloadInput').value;
    const customFeeEl = document.getElementById('customFeeInput');
    const customFee = customFeeEl ? customFeeEl.value.trim() : '';
    await sendKaspaToSelf(firstAccount, amount, payload, customFee);
  };

  // List all transactions
  document.getElementById('listTxBtn').onclick = async () => {
    await listTransactions(firstAccount);
  };

  // Transfer KAS within wallet
  document.getElementById('transferBtn').onclick = async () => {
    await transferKaspaSelf(firstAccount);
  };

  // Get transaction by direction and index
  document.getElementById('getTxBtn').onclick = async () => {
    const direction = document.getElementById('txDirection').value;
    const idxRaw = document.getElementById('txIndex').value;
    const index = Number.isNaN(parseInt(idxRaw, 10)) ? 0 : parseInt(idxRaw, 10);
    await getTransactionByIndex(firstAccount, direction, index);
  };

  // Get payload from transaction by ID
  document.getElementById('getPayloadBtn').onclick = async () => {
    const txId = document.getElementById('txIdPayloadInput').value.trim();
    await getPayloadByTxId(firstAccount, txId);
  };

  // Get latest blue score
  document.getElementById('getBlueScoreBtn').onclick = async () => {
    await getLatestBlueScore();
  };

  // Create new receive address
  const createAddrBtn = document.getElementById('createAddressBtn');
  if (createAddrBtn) {
    createAddrBtn.onclick = async () => {
      await createNewAddress(firstAccount);
    };
  }

  // Get fee estimate
  const feeBtn = document.getElementById('getFeeEstimateBtn');
  if (feeBtn) {
    feeBtn.onclick = async () => {
      await getFeeEstimate();
    };
  }

  // List all known addresses
  const listAddrsBtn = document.getElementById('listAddressesBtn');
  if (listAddrsBtn) {
    listAddrsBtn.onclick = async () => {
      await listAllAddresses();
    };
  }

  // Show mnemonic phrase
  const showMnemonicBtn = document.getElementById('showMnemonicBtn');
  if (showMnemonicBtn) {
    showMnemonicBtn.onclick = async () => {
      await showMnemonic();
    };
  }

  // Get UTXOs for addresses or script pub key
  document.getElementById('getUtxosBtn').onclick = async () => {
    const rawAddr = document.getElementById('utxoAddresses').value;
    const rawSpk = document.getElementById('utxoScriptPubKey').value;
    await getUtxosForAddresses(rawAddr, rawSpk);
  };

  // Clear log output
  const clearLogBtn = document.getElementById('clearLogBtn');
  if (clearLogBtn) {
    clearLogBtn.onclick = () => {
      clearLog();
    };
  }

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    disposeBlockScanner();
    disposeAll();
  });

  // Track if user skipped first-time setup
  let skippedFirstTimeSetup = false;
  let showLoading = false;

  // Check for first-time setup before initializing wallet
  if (isFirstTimeSetupNeeded()) {
    log('First-time setup detected. Showing setup wizard...');
    
    const setupConfig = await showFirstTimeSetupWizard();
    
    if (setupConfig) {
      // Check if this is an import or create
      if (setupConfig.isImport && setupConfig.mnemonic) {
        // User chose to import an existing wallet
        sessionStorage.setItem('kaspa_import_wallet', setupConfig.walletName);
        sessionStorage.setItem('kaspa_wallet_password', setupConfig.password);
        sessionStorage.setItem('kaspa_wallet_mnemonic', setupConfig.mnemonic);
        sessionStorage.setItem('kaspa_wallet_network', setupConfig.network);
        
        log(`Importing wallet: ${setupConfig.walletName} on ${setupConfig.network}...`);
        
        // Show loading screen for import
        showLoading = true;
        showLoadingScreen({
          title: 'Importing Wallet',
          status: 'Restoring from recovery phrase...'
        });
        progressToStep('init', []);
      } else {
        // User completed the wizard - set up session storage for wallet creation
        sessionStorage.setItem('kaspa_create_wallet', setupConfig.walletName);
        sessionStorage.setItem('kaspa_wallet_password', setupConfig.password);
        sessionStorage.setItem('kaspa_wallet_network', setupConfig.network);
        // Store the storage preference for post-creation handling
        sessionStorage.setItem('kaspa_storage_preference', setupConfig.storagePreference);
        
        log(`Creating first wallet: ${setupConfig.walletName} on ${setupConfig.network}...`);
        
        // Show loading screen for first-time wallet creation
        showLoading = true;
        showLoadingScreen({
          title: 'Creating Your Wallet',
          status: 'Initializing Kaspa WASM...'
        });
        progressToStep('init', []);
      }
      
      currentNetwork = setupConfig.network;
      if (networkSelect) {
        networkSelect.value = currentNetwork;
      }
    } else {
      // User skipped - mark as complete so we don't ask again
      markFirstTimeSetupComplete();
      skippedFirstTimeSetup = true;
      log('First-time setup skipped. You can create a wallet manually using the Wallet Manager below.');
    }
  } else if (sessionStorage.getItem('kaspa_import_wallet')) {
    // Importing wallet from wallet manager - show loading screen
    showLoading = true;
    const walletName = sessionStorage.getItem('kaspa_import_wallet') || 'wallet';
    showLoadingScreen({
      title: 'Importing Wallet',
      status: `Restoring ${walletName}...`
    });
    progressToStep('init', []);
  } else if (sessionStorage.getItem('kaspa_create_wallet')) {
    // Creating new wallet from wallet manager - show loading screen
    showLoading = true;
    const walletName = sessionStorage.getItem('kaspa_create_wallet') || 'wallet';
    showLoadingScreen({
      title: 'Creating Wallet',
      status: `Setting up ${walletName}...`
    });
    progressToStep('init', []);
  } else if (localStorage.getItem('kaspa_last_wallet') || sessionStorage.getItem('kaspa_load_wallet')) {
    // Returning user - show loading screen while resuming wallet
    showLoading = true;
    const walletName = sessionStorage.getItem('kaspa_load_wallet') || localStorage.getItem('kaspa_last_wallet') || 'wallet';
    showLoadingScreen({
      title: 'Loading Wallet',
      status: `Opening ${walletName}...`
    });
    progressToStep('init', []);
  }

  // Initialize with default (or overridden) network, then refresh wallet list
  // Skip wallet initialization if user skipped first-time setup (no wallet exists)
  if (!skippedFirstTimeSetup) {
    try {
      // Update loading progress
      if (showLoading) {
        updateLoadingStatus('Connecting to Kaspa network...');
        progressToStep('connect', ['init']);
      }
      
      await initializeWallet(currentNetwork, setFirstAccount, setLastBalance);
      
      // Update loading progress
      if (showLoading) {
        updateLoadingStatus('Wallet ready!');
        progressToStep('wallet', ['init', 'connect']);
      }
      
      // Handle first-time setup post-creation (mnemonic display/storage)
      const storagePreference = sessionStorage.getItem('kaspa_storage_preference');
      if (storagePreference) {
        sessionStorage.removeItem('kaspa_storage_preference');
        
        // Hide loading screen before showing mnemonic modal
        if (showLoading) {
          await hideLoadingScreen();
          showLoading = false;
        }
        
        const { wallet } = getInstances();
        if (wallet) {
          const walletName = sessionStorage.getItem('kaspa_current_wallet') || 'my-wallet';
          const password = sessionStorage.getItem('kaspa_wallet_password') || '';
          const network = currentNetwork;
          
          await handleFirstTimeSetup({
            walletName,
            password,
            network,
            storagePreference
          }, wallet);
          
          // Clear the password from session storage after setup is complete
          sessionStorage.removeItem('kaspa_wallet_password');
        }
      }
      
      // Hide loading screen after successful initialization
      if (showLoading) {
        await hideLoadingScreen();
      }
    } catch (err) {
      // Hide loading screen on error
      if (showLoading) {
        await hideLoadingScreen();
      }
      handleWalletInitError(err, log, renderWalletList);
    }
  }
  renderWalletList();
});
