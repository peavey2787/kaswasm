import { MIN_KAS_AMOUNT, MAX_PAYLOAD_BYTES } from './Constants.js';

export function stringToHex(str) {
  // Convert a JS string to a hex-encoded byte string (UTF-8)
  return Array.from(new TextEncoder().encode(str))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToString(hex) {
  // Remove optional "0x" prefix
  if (hex.startsWith("0x")) hex = hex.slice(2);

  // Convert hex → bytes → UTF‑8 string
  const bytes = new Uint8Array(
    hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
  );

  return new TextDecoder().decode(bytes);
}

export function validateKaspaAddress(AddressClass, address) {
  // Accept Address instances directly (as returned by the SDK)
  if (address instanceof AddressClass) return true;

  // Otherwise require a string that can be parsed into an Address
  if (typeof address !== 'string') return false;

  try {
    new AddressClass(address);
    return true;
  } catch {
    return false;
  }
}

export function validateKaspaAmount(amount) {
  const num = Number(amount);
  return !isNaN(num) && num >= MIN_KAS_AMOUNT;
}

export function validatePriorityFee(priorityFee) {
  const num = Number(priorityFee);
  return !isNaN(num) && num >= 0;
}

export function validatePayload(payload) {
  if (typeof payload !== 'string') return false;
  if (payload.length > MAX_PAYLOAD_BYTES * 2) return false;
  return true;
}

export function getConfirmations(currentBlueScore, txBlockBlueScore) {
  if (currentBlueScore == null || txBlockBlueScore == null) return 0;
  const cur = BigInt(currentBlueScore);
  const tx = BigInt(txBlockBlueScore);
  if (cur < tx) return 0;
  return Number(cur - tx + 1n);
}