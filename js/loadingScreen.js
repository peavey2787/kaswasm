// loadingScreen.js - Full-screen loading overlay for smooth transitions
// Provides an elegant loading experience during wallet initialization and other async operations

/**
 * Loading screen configuration and state
 */
const config = {
    containerId: 'kaspaLoadingScreen',
    minDisplayTime: 500, // Minimum time to show loading screen (prevents flash)
    fadeOutDuration: 300 // CSS transition duration in ms
};

let showTimestamp = 0;
let isVisible = false;

/**
 * Create the loading screen HTML structure
 * @returns {HTMLElement}
 */
function createLoadingScreen() {
    const existing = document.getElementById(config.containerId);
    if (existing) return existing;

    const container = document.createElement('div');
    container.id = config.containerId;
    container.className = 'loading-screen';
    container.innerHTML = `
        <div class="loading-screen-content">
            <div class="loading-logo">
                <svg viewBox="0 0 100 100" class="loading-spinner">
                    <circle cx="50" cy="50" r="45" class="spinner-track"></circle>
                    <circle cx="50" cy="50" r="45" class="spinner-progress"></circle>
                </svg>
                <div class="loading-icon">
                    <i class="bi bi-wallet2"></i>
                </div>
            </div>
            <h4 class="loading-title">Initializing Wallet</h4>
            <p class="loading-status">Connecting to Kaspa network...</p>
            <div class="loading-steps">
                <div class="loading-step" data-step="init">
                    <i class="bi bi-circle"></i>
                    <span>Initializing WASM</span>
                </div>
                <div class="loading-step" data-step="connect">
                    <i class="bi bi-circle"></i>
                    <span>Connecting to network</span>
                </div>
                <div class="loading-step" data-step="wallet">
                    <i class="bi bi-circle"></i>
                    <span>Opening wallet</span>
                </div>
                <div class="loading-step" data-step="ready">
                    <i class="bi bi-circle"></i>
                    <span>Ready</span>
                </div>
            </div>
        </div>
    `;

    // Add styles if not already present
    if (!document.getElementById('loadingScreenStyles')) {
        const styles = document.createElement('style');
        styles.id = 'loadingScreenStyles';
        styles.textContent = `
            .loading-screen {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: linear-gradient(135deg, #0d1117 0%, #161b22 50%, #0d1117 100%);
                display: flex;
                align-items: center;
                justify-content: center;
                /* Stay above app UI but below Bootstrap modals (1050) */
                z-index: 1040;
                opacity: 1;
                transition: opacity ${config.fadeOutDuration}ms ease-out;
            }

            .loading-screen.fade-out {
                opacity: 0;
                pointer-events: none;
            }

            .loading-screen-content {
                text-align: center;
                color: #e6edf3;
                max-width: 400px;
                padding: 2rem;
            }

            .loading-logo {
                position: relative;
                width: 120px;
                height: 120px;
                margin: 0 auto 2rem;
            }

            .loading-spinner {
                width: 100%;
                height: 100%;
                animation: rotate 2s linear infinite;
            }

            .spinner-track {
                fill: none;
                stroke: rgba(73, 234, 203, 0.1);
                stroke-width: 4;
            }

            .spinner-progress {
                fill: none;
                stroke: #49eacb;
                stroke-width: 4;
                stroke-linecap: round;
                stroke-dasharray: 283;
                stroke-dashoffset: 200;
                animation: dash 1.5s ease-in-out infinite;
                filter: drop-shadow(0 0 8px rgba(73, 234, 203, 0.5));
            }

            .loading-icon {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                font-size: 2.5rem;
                color: #49eacb;
                animation: pulse 2s ease-in-out infinite;
            }

            .loading-title {
                color: #49eacb;
                font-weight: 600;
                margin-bottom: 0.5rem;
                font-size: 1.5rem;
            }

            .loading-status {
                color: #8b949e;
                font-size: 0.95rem;
                margin-bottom: 2rem;
                min-height: 1.5em;
            }

            .loading-steps {
                display: flex;
                flex-direction: column;
                gap: 0.75rem;
                text-align: left;
                background: rgba(73, 234, 203, 0.05);
                border: 1px solid rgba(73, 234, 203, 0.1);
                border-radius: 12px;
                padding: 1.25rem;
            }

            .loading-step {
                display: flex;
                align-items: center;
                gap: 0.75rem;
                color: #8b949e;
                font-size: 0.875rem;
                transition: color 0.3s ease;
            }

            .loading-step i {
                font-size: 0.75rem;
                transition: all 0.3s ease;
            }

            .loading-step.active {
                color: #49eacb;
            }

            .loading-step.active i {
                animation: pulse 1s ease-in-out infinite;
            }

            .loading-step.active i::before {
                content: "\\F287"; /* bi-arrow-right-circle-fill */
            }

            .loading-step.completed {
                color: #3fb950;
            }

            .loading-step.completed i::before {
                content: "\\F26B"; /* bi-check-circle-fill */
            }

            .loading-step.error {
                color: #f85149;
            }

            .loading-step.error i::before {
                content: "\\F622"; /* bi-x-circle-fill */
            }

            @keyframes rotate {
                100% {
                    transform: rotate(360deg);
                }
            }

            @keyframes dash {
                0% {
                    stroke-dashoffset: 283;
                }
                50% {
                    stroke-dashoffset: 100;
                }
                100% {
                    stroke-dashoffset: 283;
                }
            }

            @keyframes pulse {
                0%, 100% {
                    opacity: 1;
                    transform: translate(-50%, -50%) scale(1);
                }
                50% {
                    opacity: 0.7;
                    transform: translate(-50%, -50%) scale(0.95);
                }
            }

            /* Responsive adjustments */
            @media (max-width: 480px) {
                .loading-logo {
                    width: 100px;
                    height: 100px;
                }
                .loading-icon {
                    font-size: 2rem;
                }
                .loading-title {
                    font-size: 1.25rem;
                }
                .loading-status {
                    font-size: 0.875rem;
                }
            }
        `;
        document.head.appendChild(styles);
    }

    document.body.appendChild(container);
    return container;
}

/**
 * Show the loading screen
 * @param {Object} [options]
 * @param {string} [options.title='Initializing Wallet'] - Main title
 * @param {string} [options.status='Connecting to Kaspa network...'] - Status message
 * @param {boolean} [options.showSteps=true] - Whether to show step indicators
 */
export function showLoadingScreen(options = {}) {
    const {
        title = 'Initializing Wallet',
        status = 'Connecting to Kaspa network...',
        showSteps = true
    } = options;

    const container = createLoadingScreen();
    
    // Update content
    const titleEl = container.querySelector('.loading-title');
    const statusEl = container.querySelector('.loading-status');
    const stepsEl = container.querySelector('.loading-steps');

    if (titleEl) titleEl.textContent = title;
    if (statusEl) statusEl.textContent = status;
    if (stepsEl) stepsEl.style.display = showSteps ? 'flex' : 'none';

    // Reset steps
    container.querySelectorAll('.loading-step').forEach(step => {
        step.classList.remove('active', 'completed', 'error');
    });

    // Show with animation
    container.classList.remove('fade-out');
    container.style.display = 'flex';
    showTimestamp = Date.now();
    isVisible = true;
}

/**
 * Update the loading screen status message
 * @param {string} status - New status message
 */
export function updateLoadingStatus(status) {
    const container = document.getElementById(config.containerId);
    if (!container) return;

    const statusEl = container.querySelector('.loading-status');
    if (statusEl) statusEl.textContent = status;
}

/**
 * Update the loading screen title
 * @param {string} title - New title
 */
export function updateLoadingTitle(title) {
    const container = document.getElementById(config.containerId);
    if (!container) return;

    const titleEl = container.querySelector('.loading-title');
    if (titleEl) titleEl.textContent = title;
}

/**
 * Mark a step as active, completed, or error
 * @param {string} stepId - Step identifier (init, connect, wallet, ready)
 * @param {'active'|'completed'|'error'} state - Step state
 */
export function setLoadingStep(stepId, state) {
    const container = document.getElementById(config.containerId);
    if (!container) return;

    const step = container.querySelector(`.loading-step[data-step="${stepId}"]`);
    if (!step) return;

    // Remove all states first
    step.classList.remove('active', 'completed', 'error');
    
    // Add new state
    if (state) {
        step.classList.add(state);
    }
}

/**
 * Progress through steps sequentially
 * @param {string} currentStep - Current step to mark as active
 * @param {string[]} [completedSteps=[]] - Steps to mark as completed
 */
export function progressToStep(currentStep, completedSteps = []) {
    const steps = ['init', 'connect', 'wallet', 'ready'];
    
    steps.forEach(step => {
        if (completedSteps.includes(step)) {
            setLoadingStep(step, 'completed');
        } else if (step === currentStep) {
            setLoadingStep(step, 'active');
        } else {
            setLoadingStep(step, null);
        }
    });
}

/**
 * Hide the loading screen with smooth fade out
 * Ensures minimum display time to prevent jarring flash
 * @returns {Promise<void>}
 */
export function hideLoadingScreen() {
    return new Promise((resolve) => {
        const container = document.getElementById(config.containerId);
        if (!container || !isVisible) {
            resolve();
            return;
        }

        // Calculate remaining time to meet minimum display duration
        const elapsed = Date.now() - showTimestamp;
        const remaining = Math.max(0, config.minDisplayTime - elapsed);

        setTimeout(() => {
            // Mark all steps as completed for satisfying finish
            progressToStep(null, ['init', 'connect', 'wallet', 'ready']);
            updateLoadingStatus('Ready!');

            // Short delay to show completed state
            setTimeout(() => {
                container.classList.add('fade-out');

                // Remove from DOM after fade
                setTimeout(() => {
                    container.style.display = 'none';
                    isVisible = false;
                    resolve();
                }, config.fadeOutDuration);
            }, 200);
        }, remaining);
    });
}

/**
 * Hide loading screen immediately without animation
 */
export function hideLoadingScreenImmediate() {
    const container = document.getElementById(config.containerId);
    if (container) {
        container.style.display = 'none';
        isVisible = false;
    }
}

/**
 * Check if loading screen is currently visible
 * @returns {boolean}
 */
export function isLoadingScreenVisible() {
    return isVisible;
}

/**
 * Convenience method for common wallet initialization flow
 * Shows loading screen and provides update methods
 * @param {Object} [options]
 * @returns {{ updateStatus: Function, setStep: Function, hide: Function, hideImmediate: Function }}
 */
export function startWalletLoading(options = {}) {
    showLoadingScreen({
        title: options.title || 'Initializing Wallet',
        status: options.status || 'Preparing...',
        showSteps: options.showSteps !== false
    });

    return {
        updateStatus: updateLoadingStatus,
        setStep: (step, completed = []) => progressToStep(step, completed),
        hide: hideLoadingScreen,
        hideImmediate: hideLoadingScreenImmediate
    };
}

export default {
    show: showLoadingScreen,
    hide: hideLoadingScreen,
    hideImmediate: hideLoadingScreenImmediate,
    updateStatus: updateLoadingStatus,
    updateTitle: updateLoadingTitle,
    setStep: setLoadingStep,
    progressToStep,
    isVisible: isLoadingScreenVisible,
    startWalletLoading
};
