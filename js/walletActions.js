// walletActions.js - UI action handlers for wallet operations
// Uses instance-based wasm-wrapper architecture

import { log } from './log.js';
import { getInstances, getCurrentWalletFilename } from './initWallet.js';
import { updateReceiveAddress } from './ui.js';
import { sompiToKaspaString } from '../wasm-wrapper/KaspaClient.js';
import { hasMnemonicStored } from './walletStorage.js';
import { showRetrieveMnemonicDialog } from './walletManager.js';
import { showResultModal, showAddressListModal, showTransactionModal } from './resultModal.js';

/**
 * Send KAS to self (for testing).
 * @param {Object} firstAccount - First account object
 * @param {string} amountKas - Amount in KAS to send
 * @param {string} [payload=''] - Optional payload (UTF-8 string)
 * @param {string} [customFeeKas] - Optional custom fee in KAS
 */
export async function sendKaspaToSelf(firstAccount, amountKas, payload = '', customFeeKas) {
    const { wallet } = getInstances();
    
    if (!wallet) {
        return log('Wallet not initialized');
    }
    if (!firstAccount) {
        return log('No account available');
    }

    // Frontend should pass plain text; Wallet.js handles all encoding.
    let safePayload = undefined;
    if (typeof payload === 'string') {
        const trimmed = payload.trim();
        if (trimmed.length > 0) {
            safePayload = trimmed;
        }
    }

    try {
        const fee = (typeof customFeeKas === 'string' && customFeeKas.trim().length > 0)
            ? customFeeKas.trim()
            : undefined;

        const sendResult = await wallet.send({
            amount: amountKas || '1.567',
            toAddress: firstAccount.changeAddress,
            payload: safePayload,
            priorityFeeKas: fee
        });
        log('sendResult: ' + JSON.stringify(sendResult, (key, value) =>
            typeof value === 'bigint' ? value.toString() : value));
        
        // Show success modal
        let content = `✅ Transaction Sent Successfully\n`;
        content += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        content += `Amount: ${amountKas || '1.567'} KAS\n`;
        if (payload) {
            content += `Payload: ${payload}\n`;
        }
        if (sendResult?.id || sendResult?.transactionId) {
            content += `\nTx ID: ${sendResult.id || sendResult.transactionId}\n`;
        }
        showResultModal('Transaction Sent', content, { type: 'success' });
    } catch (err) {
        log('Send error: ' + (err?.message || err));
        showResultModal('Send Error', err?.message || err, { type: 'error' });
    }
}

/**
 * List all transactions for the first account.
 * @param {Object} firstAccount - First account object
 */
export async function listTransactions(firstAccount) {
    const { wallet } = getInstances();
    
    if (!wallet) {
        return log('Wallet not initialized');
    }
    if (!firstAccount) {
        return log('No account available');
    }

    try {
        const txs = await wallet.listTransactions(firstAccount.accountId);
        log('\n\nTransactions\n------------');
        txs.transactions.forEach(tx => {
            log(JSON.stringify(tx, (key, value) =>
                typeof value === 'bigint' ? value.toString() : value, 2));
        });
        
        // Show summary in modal
        const txCount = txs.transactions?.length || 0;
        let content = `📋 Transaction History\n`;
        content += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        content += `Total: ${txCount} transaction(s)\n\n`;
        
        if (txCount > 0) {
            // Show summary of last 5 transactions
            const recent = txs.transactions.slice(0, 5);
            content += `Recent Transactions:\n`;
            recent.forEach((tx, i) => {
                const type = tx?.data?.type || 'unknown';
                const id = tx?.id || tx?.transactionId || 'unknown';
                content += `${i + 1}. [${type}] ${id.substring(0, 16)}...\n`;
            });
            if (txCount > 5) {
                content += `\n... and ${txCount - 5} more (see log for full list)`;
            }
        }
        
        showResultModal(`Transactions (${txCount})`, content, { type: 'info', size: 'lg' });
    } catch (err) {
        log('List transactions error: ' + (err?.message || err));
        showResultModal('Transaction List Error', err?.message || err, { type: 'error' });
    }
}

/**
 * Transfer KAS to self (for testing).
 * @param {Object} firstAccount - First account object
 */
export async function transferKaspaSelf(firstAccount) {
    const { wallet } = getInstances();
    
    if (!wallet) {
        return log('Wallet not initialized');
    }
    if (!firstAccount) {
        return log('No account available');
    }

    try {
        const transferResult = await wallet.transfer({
            amount: '2.456',
            fromAccountId: firstAccount.accountId,
            toAccountId: firstAccount.accountId
        });
        log('transferResult: ' + JSON.stringify(transferResult, (key, value) =>
            typeof value === 'bigint' ? value.toString() : value));
        
        let content = `✅ Transfer Completed\n`;
        content += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        content += `Amount: 2.456 KAS\n`;
        content += `From/To: Same Account\n`;
        showResultModal('Transfer Complete', content, { type: 'success' });
    } catch (err) {
        log('Transfer error: ' + (err?.message || err));
        showResultModal('Transfer Error', err?.message || err, { type: 'error' });
    }
}

/**
 * Create a new receive address for the first account and update the UI.
 * @param {Object} firstAccount - First account object
 */
export async function createNewAddress(firstAccount) {
    const { wallet } = getInstances();

    if (!wallet) {
        return log('Wallet not initialized');
    }
    if (!firstAccount) {
        return log('No account available');
    }

    try {
        const address = await wallet.createNewAddress({ accountId: firstAccount.accountId });
        updateReceiveAddress(address);
        log(`New receive address: ${address}`);
        showResultModal('New Address Created', address, { type: 'success' });
    } catch (err) {
        log('Create address error: ' + (err?.message || err));
        showResultModal('Address Error', err?.message || err, { type: 'error' });
    }
}

/**
 * Show the wallet's mnemonic phrase.
 * WARNING: This exposes sensitive data.
 */
export async function showMnemonic() {
    const { wallet } = getInstances();

    if (!wallet) {
        return log('Wallet not initialized');
    }

    try {
        const mnemonic = await wallet.getMnemonic();
        const filename = getCurrentWalletFilename();
        
        if (!mnemonic) {
            // Check if there's a stored mnemonic
            if (filename && hasMnemonicStored(filename)) {
                log('\n📦 Mnemonic is stored in encrypted storage.');
                log('Use the "Retrieve Stored Mnemonic" button in the Wallet Manager section.');
                showRetrieveMnemonicDialog(filename);
                return;
            }
            
            log('\n⚠️  MNEMONIC NOT AVAILABLE ⚠️');
            log('-----------------------------------');
            log('The mnemonic is only available for wallets created in this session.');
            log('For existing wallets, the mnemonic cannot be retrieved from the SDK.');
            log('You should have saved your mnemonic when you first created the wallet.');
            log('-----------------------------------');
            return;
        }
        
        log('\n⚠️  MNEMONIC PHRASE (KEEP SECRET!) ⚠️');
        log('-----------------------------------');
        log(mnemonic);
        log('-----------------------------------');
        log('⚠️  Never share this with anyone!');
    } catch (err) {
        log('Get mnemonic error: ' + (err?.message || err));
    }
}

/**
 * List all known addresses for all accounts and log them.
 */
export async function listAllAddresses() {
    const { wallet } = getInstances();

    if (!wallet) {
        return log('Wallet not initialized');
    }

    try {
        const accounts = await wallet.listAllAddresses();
        if (!accounts.length) {
            return log('No accounts / addresses available');
        }

        // Collect all addresses for modal
        const allAddresses = [];
        
        log('\nAll known addresses');
        log('-------------------');
        accounts.forEach((acc, idx) => {
            log(`Account #${idx} (id=${acc.accountId}):`);
            if (acc.receiveAddress) {
                log(`  Receive: ${acc.receiveAddress}`);
                allAddresses.push(acc.receiveAddress);
            }
            if (acc.changeAddress) {
                log(`  Change:  ${acc.changeAddress}`);
                allAddresses.push(acc.changeAddress);
            }
            if (acc.allAddresses && acc.allAddresses.length > 0) {
                log('  All:');
                acc.allAddresses.forEach(a => {
                    log(`    ${a}`);
                    if (!allAddresses.includes(a)) {
                        allAddresses.push(a);
                    }
                });
            }
        });
        
        // Show in modal
        showAddressListModal('Wallet Addresses', allAddresses);
    } catch (err) {
        log('List addresses error: ' + (err?.message || err));
    }
}

/**
 * Get a transaction by direction and index.
 * @param {Object} firstAccount - First account object
 * @param {string} direction - 'incoming' or 'outgoing'
 * @param {number} [index=0] - Transaction index
 */
export async function getTransactionByIndex(firstAccount, direction, index = 0) {
    const { wallet } = getInstances();
    
    if (!wallet) {
        return log('Wallet not initialized');
    }
    if (!firstAccount) {
        return log('No account available');
    }

    try {
        const txs = await wallet.listTransactions(firstAccount.accountId);
        const filtered = (txs.transactions || []).filter(tx => {
            const txType = tx?.data?.type;
            const isIncoming = typeof txType === 'string' && txType.toLowerCase().includes('incoming');
            const isOutgoing = typeof txType === 'string' && txType.toLowerCase().includes('outgoing');

            if (direction === 'incoming') {
                return !!isIncoming;
            }
            return !!isOutgoing;
        });

        if (!filtered.length || index < 0 || index >= filtered.length) {
            showResultModal('Transaction Not Found', `No ${direction} transaction at index ${index}.`, { type: 'warning' });
            return log(`No ${direction} transaction at index ${index}.`);
        }

        const tx = filtered[index];
        log(`\n[Tx ${direction} index=${index}]`);
        log(JSON.stringify(tx, (key, value) =>
            typeof value === 'bigint' ? value.toString() : value, 2));

        // Show decoded payload
        let payloadText = '<none>';
        try {
            const payload = wallet.getPayloadFromTransaction(tx);
            if (payload != null && payload !== '') {
                payloadText = payload;
                log(`Payload (decoded): ${payload}`);
            } else {
                log('Payload: <none>');
            }
        } catch (err) {
            log('Payload decode error: ' + (err?.message || err));
        }
        
        // Show transaction in modal
        const txDisplay = {
            ...tx,
            decodedPayload: payloadText
        };
        showTransactionModal(`${direction.charAt(0).toUpperCase() + direction.slice(1)} Transaction #${index}`, txDisplay);
    } catch (err) {
        log('Get transaction error: ' + (err?.message || err));
        showResultModal('Transaction Error', err?.message || err, { type: 'error' });
    }
}

/**
 * Get UTXOs for addresses or script pub key.
 * @param {string} addressesInput - Addresses (comma/space separated)
 * @param {string} scriptPubKeyInput - Script pub key
 */
export async function getUtxosForAddresses(addressesInput, scriptPubKeyInput) {
    const { wallet } = getInstances();
    
    if (!wallet) {
        return log('Wallet not initialized');
    }

    const rawAddr = (addressesInput || '').trim();
    const rawSpk = (scriptPubKeyInput || '').trim();

    if (rawAddr && rawSpk) {
        return log('Please enter either Addresses or Script Pub Key, not both.');
    }

    if (!rawAddr && !rawSpk) {
        return log('Please enter addresses or a script pub key.');
    }

    try {
        let addresses;

        if (rawSpk) {
            const addr = wallet.scriptPubKeyToAddress(rawSpk);
            addresses = [addr];
            log(`Derived address from script pub key: ${addr}`);
        } else {
            addresses = rawAddr.split(/[\s,]+/).filter(a => a && a.length > 0);
            if (!addresses.length) {
                return log('Please enter at least one valid address.');
            }
        }

        const res = await wallet.getUtxosByAddresses(addresses);
        log('\n\nUTXOs by Addresses\n-------------------');
        log(JSON.stringify(res, (key, value) =>
            typeof value === 'bigint' ? value.toString() : value, 2));
            
        // Show in modal
        const utxoCount = res?.entries?.length || 0;
        showResultModal(`UTXOs (${utxoCount} found)`, res, { type: 'info', size: 'lg' });
    } catch (err) {
        log('Get UTXOs error: ' + (err?.message || err));
        showResultModal('UTXO Error', err?.message || err, { type: 'error' });
    }
}

/**
 * Get payload from a transaction by ID.
 * @param {Object} firstAccount - First account object
 * @param {string} txId - Transaction ID
 */
export async function getPayloadByTxId(firstAccount, txId) {
    const { wallet } = getInstances();
    
    if (!wallet) {
        return log('Wallet not initialized');
    }
    if (!firstAccount) {
        return log('No account available');
    }
    if (!txId) {
        return log('Please enter a transaction id.');
    }

    try {
        const txs = await wallet.listTransactions(firstAccount.accountId, { start: 0, end: 200 });
        const list = Array.isArray(txs.transactions) ? txs.transactions : [];
        const tx = list.find(t => t && (
            t.id === txId || t.transactionId === txId || t.txId === txId || t.hash === txId
        ));

        if (!tx) {
            showResultModal('Transaction Not Found', 'Transaction not found in local history', { type: 'warning' });
            return log('Transaction not found in local history');
        }

        const payload = wallet.getPayloadFromTransaction(tx);
        if (payload != null && payload !== '') {
            log(`Payload (decoded): ${payload}`);
            showResultModal('Transaction Payload', payload, { type: 'success' });
        } else {
            log('Payload: <none>');
            showResultModal('Transaction Payload', 'No payload found in this transaction', { type: 'info' });
        }
    } catch (err) {
        log('Fetch payload error: ' + (err?.message || err));
        showResultModal('Payload Error', err?.message || err, { type: 'error' });
    }
}

/**
 * Get fee estimates including:
 * 1. Network fee rates (sompi/gram) for low/normal/high
 * 2. Actual estimated fee for a sample transaction (1.567 KAS to self with current payload)
 * @returns {Promise<Object | null>}
 */
export async function getFeeEstimate() {
    const { client, wallet } = getInstances();

    if (!client) {
        return log('Client not initialized');
    }

    try {
        // 1. Get network fee rates
        const res = await client.getFeeEstimate();
        
        // Build result object for modal
        const result = {
            networkRates: {},
            transactionEstimate: null
        };

        log('\n=== Fee Estimate ===\n');

        if (res && (res.low != null || res.normal != null || res.high != null)) {
            const { low, normal, high } = res;

            // Convert sompi/gram to KAS/gram for display
            const toKas = (sompi) =>
                typeof sompi === 'number' && Number.isFinite(sompi)
                    ? (sompi * 1e-8).toFixed(8)
                    : 'n/a';

            result.networkRates = {
                low: toKas(low),
                normal: toKas(normal),
                high: toKas(high)
            };

            log('Network fee rates (KAS per gram):');
            log(`  low:    ${toKas(low)}`);
            log(`  normal: ${toKas(normal)}`);
            log(`  high:   ${toKas(high)}`);
        } else {
            log('Network fee rates: not available');
        }

        // 2. Estimate actual transaction fee using current payload and amount
        if (wallet) {
            try {
            // Get payload from UI
                const payloadEl = document.getElementById('payloadInput');
                const payload = payloadEl ? payloadEl.value : '';
                
            // Get amount from UI
            const amountEl = document.getElementById('amountInput');
            const amountKas = amountEl && amountEl.value.trim() ? amountEl.value.trim() : '1.567';

                // Get custom fee from UI
                const customFeeEl = document.getElementById('customFeeInput');
                const customFee = customFeeEl && customFeeEl.value.trim() ? customFeeEl.value.trim() : undefined;

                // Get first account
                const accounts = await wallet.listAccounts();
                if (accounts?.accountDescriptors?.length) {
                    const firstAccount = accounts.accountDescriptors[0];

                    // Convert payload to hex if present
                    let payloadHex = undefined;
                    if (payload && payload.length > 0) {
                        payloadHex = Array.from(new TextEncoder().encode(payload))
                            .map(b => b.toString(16).padStart(2, '0'))
                            .join('');
                    }

                    const estimate = await wallet.estimateTransactionFee({
                        amount: amountKas,
                        toAddress: firstAccount.changeAddress,
                        payload: payloadHex,
                        priorityFeeKas: customFee
                    });

                    result.transactionEstimate = {
                        amount: amountKas,
                        mass: estimate.mass,
                        baseFee: sompiToKaspaString(estimate.baseFee) + ' KAS',
                        baseFeeSmopi: estimate.baseFee.toString(),
                        payloadSize: payload ? `${payload.length} chars → ${payloadHex ? payloadHex.length / 2 : 0} bytes` : 'none'
                    };

                    log(`\nEstimated transaction (${amountKas} KAS to self):`);
                    log(`  Mass:         ${estimate.mass} grams`);
                    // For the self-send amount, show only the base (network) fee,
                    // since this is what matches the on-chain fee for the tx.
                    log(`  Base fee:     ${sompiToKaspaString(estimate.baseFee)} KAS (${estimate.baseFee} sompi)`);
                    // Auto-fill the custom fee textbox with the base fee
                    const customFeeEl2 = document.getElementById('customFeeInput');
                    if (customFeeEl2) customFeeEl2.value = sompiToKaspaString(estimate.baseFee);
                    if (payload) {
                        log(`  Payload:      ${payload.length} chars → ${payloadHex ? payloadHex.length / 2 : 0} bytes`);
                    }
                }
            } catch (estErr) {
                log('\nTransaction estimate: ' + (estErr?.message || estErr));
            }
        }

        // Show modal with results
        let modalContent = '📊 Network Fee Rates (KAS/gram)\n';
        modalContent += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        modalContent += `   Low:    ${result.networkRates.low || 'n/a'}\n`;
        modalContent += `   Normal: ${result.networkRates.normal || 'n/a'}\n`;
        modalContent += `   High:   ${result.networkRates.high || 'n/a'}\n`;
        
        if (result.transactionEstimate) {
            modalContent += '\n💰 Transaction Estimate\n';
            modalContent += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
            modalContent += `   Amount:   ${result.transactionEstimate.amount} KAS\n`;
            modalContent += `   Mass:     ${result.transactionEstimate.mass} grams\n`;
            modalContent += `   Base Fee: ${result.transactionEstimate.baseFee}\n`;
            modalContent += `   Payload:  ${result.transactionEstimate.payloadSize}\n`;
        }
        
        showResultModal('Fee Estimate', modalContent, { type: 'info', size: 'md' });

        return res;
    } catch (err) {
        log('Fee estimate error: ' + (err?.message || err));
        showResultModal('Fee Estimate Error', err?.message || err, { type: 'error' });
        return null;
    }
}

