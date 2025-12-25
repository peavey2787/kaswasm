
# Kaspa WASM Wrapper

This folder contains a browser-friendly, instance-based wrapper for the Kaspa WASM SDK. It provides:

- Centralized client (`KaspaClient`) for WASM init, RPC connection, and network lifecycle
- High-level wallet manager (`Wallet`) for accounts, balances, and transactions
- Event and UTXO helpers (`Events`, `UtxoContext`)
- Block scanner (`BlockScanner`) for scanning blocks for transactions with specific payloads
- Shared utilities, constants, and typed error classes

The design is instance-based (no global singletons) and suitable for production browser apps.

## Basic Usage

```js
import KaspaClient from './KaspaClient.js';
import Wallet from './Wallet.js';
import Events from './Events.js';
import { BlockScanner, MatchMode } from './BlockScanner.js';

// 1. Create and connect a client
const client = new KaspaClient();
await client.connect('testnet-10');

// 2. Create a wallet instance
const wallet = new Wallet(client);
await wallet.create('password123', 'wallet-browser-demo');

// 2b. Or import an existing wallet from mnemonic
const wallet = new Wallet(client);
await wallet.import('password123', 'your 12 or 24 word mnemonic phrase here', 'imported-wallet');

// 3. Access accounts
const accounts = await wallet.listAccounts();
const firstAccount = accounts.accountDescriptors[0];

// 4. Listen for wallet events
wallet.onBalanceChanged(data => {
  console.log('Balance changed:', data);
});
wallet.onTransactionReceived(data => {
  console.log('Transaction received:', data);
});

// 5. Send KAS with a payload
await wallet.send({
  amount: '1.0',
  toAddress: firstAccount.receiveAddress,
  priorityFee: '0.001', // optional
  payload: 'hello world', // optional
});

// 6. Scan blocks for transactions with a specific payload
const events = new Events(client);
const scanner = new BlockScanner(events, { wallet });
await scanner.start('hello', MatchMode.CONTAINS, match => {
  console.log('Found transaction with payload:', match);
});
// ... later ...
await scanner.stop();

// 7. List transactions for an account
const txs = await wallet.listTransactions(firstAccount.accountId, { start: 0, end: 20 });

// 8. Delete a wallet permanently (hard delete from IndexedDB)
const deleteResult = await Wallet.deleteWallet('wallet-to-delete', 'password', 'testnet-10');
console.log('Deleted:', deleteResult.success, deleteResult.error);

// 9. Check if a wallet exists
const exists = await Wallet.walletExists('my-wallet', 'testnet-10');

// 10. Clean up when done
await wallet.close();
await client.disconnect();
```

## Wallet Deletion

The wrapper provides enterprise-grade wallet deletion via static methods:

```js
// Permanently delete a wallet and all its private key data
const result = await Wallet.deleteWallet(filename, password, networkId);
// result: { success: boolean, error?: string }

// Check if a wallet file exists before operations
const exists = await Wallet.walletExists(filename, networkId);
```


**Hard Delete Behavior:**
- Removes the wallet file from browser localStorage/IndexedDB
- Removes local wallet list references
- Requires the wallet password for authentication

## Wallet Import

Import an existing wallet using a BIP-39 mnemonic phrase:

```js
const wallet = new Wallet(client);

// Validate mnemonic before importing (optional)
const validation = Wallet.validateMnemonic('your 12 or 24 word phrase');
if (!validation.valid) {
  console.error('Invalid mnemonic:', validation.error);
}

// Import wallet from mnemonic
await wallet.import('newPassword', 'your 12 or 24 word phrase', 'imported-wallet');

// The wallet is now ready to use
const accounts = await wallet.listAccounts();
```

**Import Features:**
- Supports 12, 15, 18, 21, and 24-word BIP-39 mnemonics
- Validates mnemonic before import
- Creates a new encrypted wallet file
- Automatically derives accounts from the mnemonic
- User provides their own password for the imported wallet

## BlockScanner

`BlockScanner` scans incoming blocks for transactions with payloads matching a filter. It supports four match modes:
- `CONTAINS`: payload contains the search text
- `PREFIX`: payload starts with the search text
- `SUFFIX`: payload ends with the search text
- `EXACT`: payload matches the search text exactly

**Usage:**
```js
const scanner = new BlockScanner(events, { wallet });
await scanner.start('hello', MatchMode.CONTAINS, match => {
  // match: {
  //   txId, blockHash, blueScore, payload, decodedPayload, matchMode, searchText, timestamp, transaction
  // }
});
await scanner.stop();
```

- The scanner uses the wallet's payload decoder for DRY logic.
- The callback receives full transaction details for UI inspection.

## API Reference


For a detailed, always up-to-date API reference (generated dynamically from the actual JS modules at runtime), open:

- [wasm-wrapper/api-reference.html](./api-reference.html)

This page introspects classes, methods, and exports from the wrapper modules in a style similar to the official Kaspa WASM SDK docs.

## Notes
- Wallet data is persisted in browser storage (e.g. `localStorage`/IndexedDB)
- The wrapper is intended for browser environments with ES module support
- Ensure `kas-wasm/kaspa.js` and its WASM file are present and loadable

---

## Legacy Static API Notes

Earlier versions of this README contained a fully inlined API reference by file. That content has been superseded by the dynamic api-reference.html page, which now serves as the canonical, self-updating documentation source.
