// blockScannerUI.js - UI controller for the Block Scanner feature
// Handles start/stop scanning, rendering results, and managing the BlockScanner instance

import { BlockScanner, MatchMode } from '../wasm-wrapper/BlockScanner.js';
import { getInstances } from './initWallet.js';
import { log } from './log.js';

/** @type {BlockScanner|null} */
let scannerInstance = null;

/** @type {Array<Object>} */
let results = [];

/** Maximum results to display */
const MAX_RESULTS = 50;

/**
 * Get DOM elements for the scanner UI.
 */
function getElements() {
    return {
        searchText: document.getElementById('scannerSearchText'),
        matchMode: document.getElementById('scannerMatchMode'),
        toggleBtn: document.getElementById('scannerToggleBtn'),
        clearBtn: document.getElementById('scannerClearBtn'),
        status: document.getElementById('scannerStatus'),
        resultsList: document.getElementById('scannerResultsList'),
        resultCount: document.getElementById('scannerResultCount')
    };
}

/**
 * Update the scanner status badge.
 * @param {boolean} isScanning
 */
function updateStatus(isScanning) {
    const { status } = getElements();
    if (!status) return;

    if (isScanning) {
        status.innerHTML = `<span class="badge bg-success"><i class="bi bi-broadcast me-1"></i>Scanning...</span>`;
    } else {
        status.innerHTML = `<span class="badge bg-secondary"><i class="bi bi-stop-circle me-1"></i>Stopped</span>`;
    }
}

/**
 * Update the toggle button state.
 * @param {boolean} isScanning
 */
function updateToggleButton(isScanning) {
    const { toggleBtn } = getElements();
    if (!toggleBtn) return;

    if (isScanning) {
        toggleBtn.innerHTML = `<i class="bi bi-stop-fill me-1"></i>Stop Scanning`;
        toggleBtn.classList.remove('btn-kaspa');
        toggleBtn.classList.add('btn-danger');
    } else {
        toggleBtn.innerHTML = `<i class="bi bi-play-fill me-1"></i>Start Scanning`;
        toggleBtn.classList.remove('btn-danger');
        toggleBtn.classList.add('btn-kaspa');
    }
}

/**
 * Render the results list.
 */
function renderResults() {
    const { resultsList, resultCount } = getElements();
    if (!resultsList || !resultCount) return;

    resultCount.textContent = results.length.toString();

    if (results.length === 0) {
        resultsList.innerHTML = `<div class="p-2 text-muted">No matches yet. Start scanning to search incoming blocks...</div>`;
        return;
    }

    // Build HTML for results (newest first)
    const html = results.map((match, idx) => {
        const truncatedPayload = match.decodedPayload.length > 60 
            ? match.decodedPayload.substring(0, 60) + '...' 
            : match.decodedPayload;
        const truncatedTxId = match.txId 
            ? match.txId.substring(0, 16) + '...' 
            : 'Unknown';
        const time = new Date(match.timestamp).toLocaleTimeString();
        
        return `
            <div class="block-row d-flex justify-content-between align-items-center p-2 border-bottom scanner-result-row" 
                 data-result-index="${idx}" 
                 style="cursor: pointer; transition: background-color 0.2s;">
                <div class="d-flex align-items-center gap-2">
                    <span class="badge bg-kaspa">${time}</span>
                    <span class="text-muted small">TX: ${truncatedTxId}</span>
                </div>
                <div class="flex-grow-1 mx-3 text-truncate small" style="max-width: 300px;">
                    <i class="bi bi-chat-text me-1"></i>${escapeHtml(truncatedPayload)}
                </div>
                <div class="d-flex align-items-center gap-2">
                    <span class="badge bg-info">${match.matchMode}</span>
                    <i class="bi bi-chevron-right text-muted"></i>
                </div>
            </div>
        `;
    }).join('');

    resultsList.innerHTML = html;

    // Add click handlers
    resultsList.querySelectorAll('.scanner-result-row').forEach(row => {
        row.addEventListener('click', () => {
            const idx = parseInt(row.getAttribute('data-result-index'), 10);
            if (!isNaN(idx) && results[idx]) {
                showResultModal(results[idx]);
            }
        });
        row.addEventListener('mouseenter', () => {
            row.style.backgroundColor = 'var(--kaspa-bg-input)';
        });
        row.addEventListener('mouseleave', () => {
            row.style.backgroundColor = '';
        });
    });
}

/**
 * Escape HTML special characters.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Safely stringify an object for display, handling BigInt and circular refs.
 * @param {any} value
 * @returns {string}
 */
function safeStringify(value) {
    const seen = new WeakSet();
    try {
        return JSON.stringify(value, (key, val) => {
            if (typeof val === 'bigint') {
                return val.toString();
            }
            if (val && typeof val === 'object') {
                if (seen.has(val)) {
                    return '[Circular]';
                }
                seen.add(val);
            }
            return val;
        }, 2);
    } catch (err) {
        console.error('[BlockScanner] Failed to stringify transaction:', err);
        return String(value ?? '');
    }
}

/**
 * Show a modal with full transaction details.
 * @param {Object} match
 */
function showResultModal(match) {
    // Remove existing modal if any
    const existing = document.getElementById('scannerResultModal');
    if (existing) existing.remove();

    const time = new Date(match.timestamp).toLocaleString();
    const jsonStr = safeStringify(match.transaction);

    const modal = document.createElement('div');
    modal.id = 'scannerResultModal';
    modal.className = 'modal d-block';
    modal.style.cssText = 'background: rgba(0,0,0,0.9); z-index: 12000;';
    modal.setAttribute('tabindex', '-1');

    modal.innerHTML = `
        <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
            <div class="modal-content" style="background-color: var(--kaspa-bg-card); border: 1px solid var(--kaspa-border);">
                <div class="modal-header" style="border-bottom-color: var(--kaspa-border);">
                    <h5 class="modal-title">
                        <i class="bi bi-search me-2"></i>Matching Transaction
                    </h5>
                    <button type="button" class="btn-close btn-close-white" id="scannerModalClose"></button>
                </div>
                <div class="modal-body">
                    <div class="row g-3 mb-3">
                        <div class="col-12 col-md-6">
                            <label class="form-label small text-muted">Found At</label>
                            <div class="small">${time}</div>
                        </div>
                        <div class="col-12 col-md-6">
                            <label class="form-label small text-muted">Match Mode</label>
                            <div><span class="badge bg-info">${match.matchMode}</span> for "<code>${escapeHtml(match.searchText)}</code>"</div>
                        </div>
                    </div>
                    <div class="mb-3">
                        <label class="form-label small text-muted">Transaction ID</label>
                        <div class="small text-break font-monospace" style="word-break: break-all;">${match.txId || 'Unknown'}</div>
                    </div>
                    <div class="mb-3">
                        <label class="form-label small text-muted">Block Hash</label>
                        <div class="small text-break font-monospace" style="word-break: break-all;">${match.blockHash || 'Unknown'}</div>
                    </div>
                    <div class="mb-3">
                        <label class="form-label small text-muted">Decoded Payload</label>
                        <div class="p-2 rounded small" style="background-color: var(--kaspa-bg-input); word-break: break-all;">
                            ${escapeHtml(match.decodedPayload)}
                        </div>
                    </div>
                    <div class="mb-3">
                        <label class="form-label small text-muted">Raw Payload (hex)</label>
                        <div class="p-2 rounded small font-monospace" style="background-color: var(--kaspa-bg-input); word-break: break-all; max-height: 100px; overflow-y: auto;">
                            ${match.payload || 'N/A'}
                        </div>
                    </div>
                    <div>
                        <label class="form-label small text-muted">Full Transaction JSON</label>
                        <pre class="p-2 rounded small" style="background-color: var(--kaspa-bg-input); max-height: 300px; overflow: auto;">${escapeHtml(jsonStr)}</pre>
                    </div>
                </div>
                <div class="modal-footer" style="border-top-color: var(--kaspa-border);">
                    <button type="button" class="btn btn-kaspa btn-sm" id="scannerModalCopyBtn">
                        <i class="bi bi-clipboard me-1"></i>Copy JSON
                    </button>
                    <button type="button" class="btn btn-outline-secondary btn-sm" id="scannerModalCloseBtn">
                        Close
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    
    modal.querySelector('#scannerModalClose').onclick = closeModal;
    modal.querySelector('#scannerModalCloseBtn').onclick = closeModal;
    modal.querySelector('#scannerModalCopyBtn').onclick = () => {
        navigator.clipboard.writeText(jsonStr).then(() => {
            const btn = modal.querySelector('#scannerModalCopyBtn');
            btn.innerHTML = '<i class="bi bi-check me-1"></i>Copied!';
            setTimeout(() => {
                btn.innerHTML = '<i class="bi bi-clipboard me-1"></i>Copy JSON';
            }, 2000);
        });
    };

    // Close on Escape
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
}

/**
 * Handle match callback from BlockScanner.
 * @param {Object} match
 */
function onMatchFound(match) {
    results.unshift(match); // Add to beginning (newest first)
    
    // Limit results
    if (results.length > MAX_RESULTS) {
        results = results.slice(0, MAX_RESULTS);
    }

    renderResults();
    log(`[BlockScanner] Match found: "${match.decodedPayload.substring(0, 50)}..."`);
}

/**
 * Start scanning.
 */
async function startScanning() {
    const { searchText, matchMode } = getElements();
    if (!searchText || !matchMode) return;

    const text = searchText.value.trim();
    if (!text) {
        log('[BlockScanner] Please enter search text.');
        return;
    }

    const mode = matchMode.value || MatchMode.CONTAINS;

    // Get the events + wallet instances
    const { events, wallet } = getInstances();
    if (!events || !wallet) {
        log('[BlockScanner] No active connection or wallet. Initialize a wallet first.');
        return;
    }

    // Create scanner if needed (pass wallet so it can reuse payload decoding)
    if (!scannerInstance) {
        scannerInstance = new BlockScanner(events, { wallet });
    }

    try {
        await scannerInstance.start(text, mode, onMatchFound);
        updateStatus(true);
        updateToggleButton(true);
        log(`[BlockScanner] Started scanning for "${text}" (${mode})`);
    } catch (err) {
        log(`[BlockScanner] Error starting: ${err.message}`);
    }
}

/**
 * Stop scanning.
 */
async function stopScanning() {
    if (scannerInstance) {
        await scannerInstance.stop();
    }
    updateStatus(false);
    updateToggleButton(false);
    log('[BlockScanner] Stopped scanning.');
}

/**
 * Toggle scanning on/off.
 */
async function toggleScanning() {
    if (scannerInstance && scannerInstance.isScanning) {
        await stopScanning();
    } else {
        await startScanning();
    }
}

/**
 * Clear all results.
 */
function clearResults() {
    results = [];
    renderResults();
    log('[BlockScanner] Results cleared.');
}

/**
 * Initialize the Block Scanner UI.
 */
export function initBlockScannerUI() {
    const { toggleBtn, clearBtn } = getElements();

    if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleScanning);
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', clearResults);
    }

    // Initial render
    renderResults();
    updateStatus(false);
    updateToggleButton(false);

    log('[BlockScanner] UI initialized.');
}

/**
 * Dispose the scanner (call on page unload or network change).
 */
export async function disposeBlockScanner() {
    if (scannerInstance) {
        await scannerInstance.dispose();
        scannerInstance = null;
    }
}

/**
 * Reset the scanner for a new network connection.
 * Call this after network changes to get a fresh scanner.
 */
export function resetScanner() {
    if (scannerInstance) {
        scannerInstance.stop().catch(() => {});
        scannerInstance = null;
    }
    updateStatus(false);
    updateToggleButton(false);
}
