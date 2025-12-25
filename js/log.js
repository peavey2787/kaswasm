// Track if we're in "suppress mode" - skip JSON blobs after [DEBUG] lines
let suppressingDebug = false;

export function log(msg) {
  // Suppress any debug messages starting with [DEBUG]
  if (typeof msg === 'string' && msg.startsWith('[DEBUG]')) {
    suppressingDebug = true;
    return;
  }

  // If we see a normal message after suppression, stop suppressing
  if (suppressingDebug) {
    // Check if this looks like a JSON continuation or end of debug block
    const trimmed = typeof msg === 'string' ? msg.trim() : '';
    // If it starts with { or } or is indented JSON, skip it
    if (trimmed.startsWith('{') || trimmed.startsWith('}') || trimmed.startsWith('"') || trimmed === '') {
      return;
    }
    // Otherwise, a real message - stop suppressing
    suppressingDebug = false;
  }

  const el = document.getElementById('output');
  el.textContent += msg + '\n';
}

export function logTable(arr) {
  function replacer(key, value) {
    return typeof value === 'bigint' ? value.toString() : value;
  }
  log(JSON.stringify(arr, replacer, 2));
}

export function clearLog() {
  suppressingDebug = false;
  const el = document.getElementById('output');
  if (el) {
    el.textContent = '';
  }
}
