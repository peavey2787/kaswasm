// events.js - Event registration and blue score utilities

import { log, logTable } from './log.js';
import { updateBalance, updateReceiveAddress } from './ui.js';
import { getInstances } from './initWallet.js';

/**
 * Register wallet event handlers.
 * @param {Wallet} wallet - Wallet instance
 * @param {Function} getFirstAccount - Function to get first account
 * @param {Function} setLastBalance - Function to set last balance
 */
export function registerWalletEvents(wallet, getFirstAccount, setLastBalance) {
    wallet.onBalanceChanged((data) => {
        console.log('[OnBalanceChanged] data:', data);
        setLastBalance(data.balance);
        updateBalance(data.balance);
        const firstAccount = getFirstAccount();
        if (firstAccount?.receiveAddress) {
            updateReceiveAddress(firstAccount.receiveAddress);
        }
        log('\n\nBalance\n-------');
        logTable([{
            Account: data.id?.substring(0, 5) + '...',
            Mature: data.balance?.mature,
            Pending: data.balance?.pending,
            Outgoing: data.balance?.outgoing,
            MatureUtxo: data.balance?.matureUtxoCount,
            PendingUtxo: data.balance?.pendingUtxoCount,
            StasisUtxo: data.balance?.stasisUtxoCount
        }]);
    });

    wallet.onTransactionReceived((data) => {
        log('Transaction event: ' + data.type);
        logTable(data);
    });
}

// Internal state for live block stream
let recentBlocks = [];

function renderBlocks() {
    const container = document.getElementById('blocksList');
    if (!container) return;

    if (!recentBlocks.length) {
        container.textContent = 'Waiting for new blocks...';
        return;
    }

    // Render each block as its own Bootstrap-styled row for consistency
    container.innerHTML = '';

    recentBlocks.forEach(b => {
        const fullHash = b.hash ? String(b.hash) : '';
        const shortHash = fullHash ? fullHash.slice(0, 12) + '…' : '-';
        const blue = b.blueScore != null ? String(b.blueScore) : '-';
        let time = '';
        let isoTime = '';
        if (b.time != null) {
            const ms = typeof b.time === 'bigint' ? Number(b.time) : Number(b.time);
            if (!Number.isNaN(ms)) {
                const d = new Date(ms);
                time = d.toLocaleTimeString();
                isoTime = d.toISOString();
            }
        }

        const row = document.createElement('div');
        row.className = 'd-flex justify-content-between align-items-center py-1 px-2 mb-1 rounded-2';
        row.style.backgroundColor = 'var(--kaspa-bg-input)';
        row.style.border = '1px solid var(--kaspa-border)';
        row.style.fontSize = '0.8rem';
        row.style.cursor = 'pointer';

        row.innerHTML = `
            <span class="text-muted">${time || '&nbsp;'}</span>
            <span class="ms-2 flex-grow-1 text-truncate">blue score = ${blue}</span>
            <span class="ms-2 text-kaspa">${shortHash}</span>
        `;

        // On click, show pertinent metadata and allow viewing full JSON via result modal
        row.addEventListener('click', async () => {
            try {
                const { showResultModal } = await import('./resultModal.js');
                const header = b.header || {};
                const block = b.block || null;

                const meta = {
                    hash: fullHash || null,
                    shortHash,
                    blueScore: b.blueScore ?? null,
                    timeLocal: time || null,
                    timeIso: isoTime || null,
                    parentsCount: header.parents ? header.parents.length : null,
                    isHeaderOnly: !!header.isHeaderOnly,
                    // Expose full block structure for advanced users / copy
                    fullBlock: block
                };

                showResultModal('Block Details', meta, { type: 'info', size: 'lg' });
            } catch (err) {
                log('Error showing block details: ' + (err?.message || err));
            }
        });

        container.appendChild(row);
    });
}

/**
 * Start a live stream of new blocks into the blocks container.
 * Safe to call multiple times; subscription will only be registered once.
 * @param {Events} eventsInstance
 */
export async function startBlockStream(eventsInstance) {
    if (!eventsInstance) return;

    // Ensure container exists before subscribing
    if (!document.getElementById('blocksList')) {
        return;
    }

    recentBlocks = [];

    const handler = (data) => {
        const block = data?.block || null;
        const header = block?.header || {};
        const hash = block?.hash || header.hash || null;
        const blueScore = header.blueScore;
        const rawTime = header.timeInMillis ?? header.timestamp ?? Date.now();

        // Keep lightweight metadata plus full block for detail view
        recentBlocks.unshift({ hash, blueScore, time: rawTime, header, block });
        if (recentBlocks.length > 10) {
            recentBlocks.length = 10;
        }

        renderBlocks();
    };

    try {
        await eventsInstance.subscribe('block-added', handler);
        console.log('[Blocks] Subscribed to block-added events');
        renderBlocks();
    } catch (err) {
        log('Error starting block stream: ' + (err?.message || err));
    }
}

/**
 * Get the latest blue score using the Events instance.
 * @returns {Promise<bigint>}
 */
export async function getLatestBlueScore() {
    const { showResultModal } = await import('./resultModal.js');
    const { events } = getInstances();
    
    if (!events) {
        const msg = 'Events not initialized. Please wait for wallet to initialize.';
        log(msg);
        showResultModal('Blue Score Error', msg, { type: 'warning' });
        return;
    }

    try {
        const blueScore = await events.getSinkBlueScore();
        log(`Latest Sink Blue Score: ${blueScore}`);

        let liveBlueScore = null;
        // Also get live blue score from next block
        try {
            liveBlueScore = await events.getLatestBlockBlueScore(10000);
            log(`Latest Live Blue Score: ${liveBlueScore}`);
        } catch (err) {
            log('(Timed out waiting for next block)');
        }

        // Show in modal
        let content = `📊 Blue Score Information\n`;
        content += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        content += `Sink Blue Score:  ${blueScore}\n`;
        if (liveBlueScore) {
            content += `Live Blue Score:  ${liveBlueScore}\n`;
        }
        showResultModal('Blue Score', content, { type: 'success' });

        return blueScore;
    } catch (err) {
        log('Error fetching latest blue score: ' + (err?.message || err));
        showResultModal('Blue Score Error', err?.message || err, { type: 'error' });
        throw err;
    }
}
