// resultModal.js - Reusable modal for displaying action results

/**
 * Show a result modal with the given title and content.
 * @param {string} title - Modal title
 * @param {string|object} content - Content to display (string or object to JSON-stringify)
 * @param {object} [options] - Optional settings
 * @param {string} [options.type='info'] - Type: 'info', 'success', 'warning', 'error'
 * @param {boolean} [options.copyable=true] - Show copy button
 * @param {string} [options.size='md'] - Modal size: 'sm', 'md', 'lg', 'xl'
 */
export function showResultModal(title, content, options = {}) {
    const {
        type = 'info',
        copyable = true,
        size = 'md'
    } = options;
    
    // Remove existing modal if any
    const existingModal = document.getElementById('resultModal');
    if (existingModal) existingModal.remove();
    
    // Format content
    let formattedContent = content;
    let rawContent = content;
    
    if (typeof content === 'object') {
        rawContent = JSON.stringify(content, (key, value) =>
            typeof value === 'bigint' ? value.toString() : value, 2);
        formattedContent = formatContentAsHtml(content);
    } else if (typeof content === 'string') {
        rawContent = content;
        formattedContent = escapeHtml(content);
    }
    
    // Icon and color based on type
    const typeConfig = {
        info: { icon: 'bi-info-circle-fill', color: 'var(--kaspa-primary)', headerBg: 'rgba(73, 234, 203, 0.1)' },
        success: { icon: 'bi-check-circle-fill', color: '#4ade80', headerBg: 'rgba(74, 222, 128, 0.1)' },
        warning: { icon: 'bi-exclamation-triangle-fill', color: '#fbbf24', headerBg: 'rgba(251, 191, 36, 0.1)' },
        error: { icon: 'bi-x-circle-fill', color: '#f87171', headerBg: 'rgba(248, 113, 113, 0.1)' }
    };
    
    const config = typeConfig[type] || typeConfig.info;
    
    const modal = document.createElement('div');
    modal.id = 'resultModal';
    modal.className = 'modal d-block';
    modal.style.cssText = 'background: rgba(0,0,0,0.85); z-index: 10000;';
    modal.setAttribute('tabindex', '-1');
    
    modal.innerHTML = `
        <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-${size}">
            <div class="modal-content" style="background-color: var(--kaspa-bg-card); border-color: var(--kaspa-border);">
                <div class="modal-header" style="background-color: ${config.headerBg}; border-bottom-color: var(--kaspa-border);">
                    <h5 class="modal-title" style="color: ${config.color};">
                        <i class="bi ${config.icon} me-2"></i>${escapeHtml(title)}
                    </h5>
                    <button type="button" class="btn-close btn-close-white" id="resultModalClose"></button>
                </div>
                <div class="modal-body">
                    <div class="result-content p-3 rounded" style="background-color: var(--kaspa-bg-input); max-height: 60vh; overflow: auto;">
                        <pre class="mb-0" style="color: var(--kaspa-primary); white-space: pre-wrap; word-break: break-word; font-size: 0.875rem;">${formattedContent}</pre>
                    </div>
                </div>
                <div class="modal-footer" style="border-top-color: var(--kaspa-border);">
                    ${copyable ? `
                    <button type="button" class="btn btn-outline-kaspa btn-sm" id="resultModalCopy">
                        <i class="bi bi-clipboard me-1"></i>Copy
                    </button>
                    ` : ''}
                    <button type="button" class="btn btn-kaspa btn-sm" id="resultModalOk">
                        <i class="bi bi-check-lg me-1"></i>OK
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const closeModal = () => modal.remove();
    
    document.getElementById('resultModalClose').onclick = closeModal;
    document.getElementById('resultModalOk').onclick = closeModal;
    
    if (copyable) {
        document.getElementById('resultModalCopy').onclick = async () => {
            try {
                await navigator.clipboard.writeText(rawContent);
                const btn = document.getElementById('resultModalCopy');
                btn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Copied!';
                btn.className = 'btn btn-success btn-sm';
                setTimeout(() => {
                    btn.innerHTML = '<i class="bi bi-clipboard me-1"></i>Copy';
                    btn.className = 'btn btn-outline-kaspa btn-sm';
                }, 2000);
            } catch (err) {
                console.error('Failed to copy:', err);
            }
        };
    }
    
    // Close on background click
    modal.onclick = (e) => {
        if (e.target === modal) closeModal();
    };
    
    // Close on Escape key
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
}

/**
 * Show a simple address list modal.
 * @param {string} title - Modal title
 * @param {string[]} addresses - Array of addresses
 */
export function showAddressListModal(title, addresses) {
    const existingModal = document.getElementById('resultModal');
    if (existingModal) existingModal.remove();
    
    const modal = document.createElement('div');
    modal.id = 'resultModal';
    modal.className = 'modal d-block';
    modal.style.cssText = 'background: rgba(0,0,0,0.85); z-index: 10000;';
    modal.setAttribute('tabindex', '-1');
    
    const addressRows = addresses.map((addr, i) => `
        <div class="d-flex align-items-center justify-content-between p-2 rounded mb-1" style="background-color: var(--kaspa-bg-dark);">
            <div class="d-flex align-items-center">
                <span class="badge bg-secondary me-2">${i + 1}</span>
                <code class="small text-break" style="color: var(--kaspa-primary);">${escapeHtml(addr)}</code>
            </div>
            <button class="btn btn-outline-kaspa btn-sm ms-2 copy-addr-btn" data-addr="${escapeHtml(addr)}">
                <i class="bi bi-clipboard"></i>
            </button>
        </div>
    `).join('');
    
    modal.innerHTML = `
        <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg">
            <div class="modal-content" style="background-color: var(--kaspa-bg-card); border-color: var(--kaspa-border);">
                <div class="modal-header" style="background-color: rgba(73, 234, 203, 0.1); border-bottom-color: var(--kaspa-border);">
                    <h5 class="modal-title" style="color: var(--kaspa-primary);">
                        <i class="bi bi-card-list me-2"></i>${escapeHtml(title)}
                    </h5>
                    <button type="button" class="btn-close btn-close-white" id="resultModalClose"></button>
                </div>
                <div class="modal-body">
                    <div class="mb-2 small text-muted">
                        <i class="bi bi-info-circle me-1"></i>${addresses.length} address(es) found
                    </div>
                    <div style="max-height: 50vh; overflow-y: auto;">
                        ${addressRows}
                    </div>
                </div>
                <div class="modal-footer" style="border-top-color: var(--kaspa-border);">
                    <button type="button" class="btn btn-outline-kaspa btn-sm" id="resultModalCopyAll">
                        <i class="bi bi-clipboard me-1"></i>Copy All
                    </button>
                    <button type="button" class="btn btn-kaspa btn-sm" id="resultModalOk">
                        <i class="bi bi-check-lg me-1"></i>OK
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const closeModal = () => modal.remove();
    
    document.getElementById('resultModalClose').onclick = closeModal;
    document.getElementById('resultModalOk').onclick = closeModal;
    
    // Copy individual addresses
    modal.querySelectorAll('.copy-addr-btn').forEach(btn => {
        btn.onclick = async () => {
            try {
                await navigator.clipboard.writeText(btn.dataset.addr);
                btn.innerHTML = '<i class="bi bi-check-lg"></i>';
                btn.className = 'btn btn-success btn-sm ms-2';
                setTimeout(() => {
                    btn.innerHTML = '<i class="bi bi-clipboard"></i>';
                    btn.className = 'btn btn-outline-kaspa btn-sm ms-2 copy-addr-btn';
                }, 1500);
            } catch (err) {
                console.error('Failed to copy:', err);
            }
        };
    });
    
    // Copy all addresses
    document.getElementById('resultModalCopyAll').onclick = async () => {
        try {
            await navigator.clipboard.writeText(addresses.join('\n'));
            const btn = document.getElementById('resultModalCopyAll');
            btn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Copied!';
            btn.className = 'btn btn-success btn-sm';
            setTimeout(() => {
                btn.innerHTML = '<i class="bi bi-clipboard me-1"></i>Copy All';
                btn.className = 'btn btn-outline-kaspa btn-sm';
            }, 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };
    
    // Close on background click
    modal.onclick = (e) => {
        if (e.target === modal) closeModal();
    };
}

/**
 * Show a transaction details modal.
 * @param {string} title - Modal title
 * @param {object} txData - Transaction data
 */
export function showTransactionModal(title, txData) {
    const existingModal = document.getElementById('resultModal');
    if (existingModal) existingModal.remove();
    
    const modal = document.createElement('div');
    modal.id = 'resultModal';
    modal.className = 'modal d-block';
    modal.style.cssText = 'background: rgba(0,0,0,0.85); z-index: 10000;';
    modal.setAttribute('tabindex', '-1');
    
    // Format transaction data nicely
    const txHtml = formatTransactionHtml(txData);
    const rawJson = JSON.stringify(txData, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value, 2);
    
    modal.innerHTML = `
        <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg">
            <div class="modal-content" style="background-color: var(--kaspa-bg-card); border-color: var(--kaspa-border);">
                <div class="modal-header" style="background-color: rgba(73, 234, 203, 0.1); border-bottom-color: var(--kaspa-border);">
                    <h5 class="modal-title" style="color: var(--kaspa-primary);">
                        <i class="bi bi-arrow-left-right me-2"></i>${escapeHtml(title)}
                    </h5>
                    <button type="button" class="btn-close btn-close-white" id="resultModalClose"></button>
                </div>
                <div class="modal-body" style="max-height: 70vh; overflow-y: auto;">
                    ${txHtml}
                </div>
                <div class="modal-footer" style="border-top-color: var(--kaspa-border);">
                    <button type="button" class="btn btn-outline-kaspa btn-sm" id="resultModalCopy">
                        <i class="bi bi-clipboard me-1"></i>Copy JSON
                    </button>
                    <button type="button" class="btn btn-kaspa btn-sm" id="resultModalOk">
                        <i class="bi bi-check-lg me-1"></i>OK
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const closeModal = () => modal.remove();
    
    document.getElementById('resultModalClose').onclick = closeModal;
    document.getElementById('resultModalOk').onclick = closeModal;
    
    document.getElementById('resultModalCopy').onclick = async () => {
        try {
            await navigator.clipboard.writeText(rawJson);
            const btn = document.getElementById('resultModalCopy');
            btn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Copied!';
            btn.className = 'btn btn-success btn-sm';
            setTimeout(() => {
                btn.innerHTML = '<i class="bi bi-clipboard me-1"></i>Copy JSON';
                btn.className = 'btn btn-outline-kaspa btn-sm';
            }, 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };
    
    modal.onclick = (e) => {
        if (e.target === modal) closeModal();
    };
}

// Helper functions

function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatContentAsHtml(obj) {
    const json = JSON.stringify(obj, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value, 2);
    return escapeHtml(json);
}

function formatTransactionHtml(txData) {
    let html = '';
    
    // Handle different transaction data structures
    if (txData.id || txData.transactionId) {
        const txId = txData.id || txData.transactionId;
        html += `
            <div class="mb-3">
                <label class="small text-muted">Transaction ID</label>
                <div class="p-2 rounded d-flex align-items-center justify-content-between" style="background-color: var(--kaspa-bg-input);">
                    <code class="small text-break" style="color: var(--kaspa-primary);">${escapeHtml(txId)}</code>
                    <button class="btn btn-outline-kaspa btn-sm ms-2 copy-field-btn" data-value="${escapeHtml(txId)}">
                        <i class="bi bi-clipboard"></i>
                    </button>
                </div>
            </div>
        `;
    }
    
    // Common fields
    const fields = [
        { key: 'blockTime', label: 'Block Time', format: (v) => v ? new Date(v).toLocaleString() : '-' },
        { key: 'amount', label: 'Amount', format: (v) => v || '-' },
        { key: 'fee', label: 'Fee', format: (v) => v || '-' },
        { key: 'status', label: 'Status', format: (v) => v || '-' },
    ];
    
    for (const field of fields) {
        if (txData[field.key] !== undefined) {
            html += `
                <div class="mb-2 row">
                    <div class="col-4 small text-muted">${field.label}</div>
                    <div class="col-8" style="color: var(--kaspa-primary);">${field.format(txData[field.key])}</div>
                </div>
            `;
        }
    }
    
    // Show full JSON in collapsible
    const rawJson = JSON.stringify(txData, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value, 2);
    
    html += `
        <div class="mt-3">
            <button class="btn btn-outline-secondary btn-sm w-100" type="button" data-bs-toggle="collapse" data-bs-target="#rawJsonCollapse">
                <i class="bi bi-code-slash me-1"></i>Show Raw JSON
            </button>
            <div class="collapse mt-2" id="rawJsonCollapse">
                <pre class="p-3 rounded mb-0" style="background-color: var(--kaspa-bg-input); color: var(--kaspa-primary); font-size: 0.75rem; max-height: 300px; overflow: auto;">${escapeHtml(rawJson)}</pre>
            </div>
        </div>
    `;
    
    return html;
}
