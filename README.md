# kaswasm

## Why I Made This

I made this wrapper because the official Kaspa WASM SDK is quite large and intimidating for new developers. To be honest, I used AI (including GitHub Copilot, GPT-4, GPT-5.1, Claude Opus 4.5) to help me figure out how to use the WASM SDK, so it's entirely possible I'm doing something the wrong way. If you want to use this in a production environment, you should definitely have someone audit the code and the integration for security and correctness.

## Usage

This project uses the Kaspa core devs' WASM SDK to create a Kaspa wallet in the browser.

Download the kaspa wasm sdk from [https://aspectron.org/en/projects/kaspa-wasm.html](https://aspectron.org/en/projects/kaspa-wasm.html) and unzip it in the same folder as this `index.html` file on a web server to use.

## Quick Demo: Using wasm-wrapper

### 1. Connect to Kaspa and Get Recent Blocks

```js
import KaspaClient from './wasm-wrapper/KaspaClient.js';

async function printRecentBlocks() {
  const client = new KaspaClient();
  await client.connect('testnet-10'); // or 'mainnet'

  // Listen for new blocks
  client.on('blockAdded', (block) => {
    console.log('New block:', block.blueScore, block.hash);
  });

  // Optionally fetch the latest blue score (closest thing to block height)
  const latest = await client.getBlockDagInfo();
  console.log('Latest blue score:', latest.virtualBlueScore);
}

printRecentBlocks();
```

---

### 2. Create/Open a Wallet and Send a Transaction with Payload

```js
import KaspaClient from './wasm-wrapper/KaspaClient.js';
import Wallet from './wasm-wrapper/Wallet.js';

async function createAndSend() {
  const client = new KaspaClient();
  await client.connect('testnet-10');

  // Create a new wallet (or open if it exists)
  const wallet = new Wallet(client);
  await wallet.create('your-password', 'my-wallet');

  // List accounts
  const accounts = await wallet.listAccounts();
  const firstAccount = accounts.accountDescriptors[0];

  // NOTE: You must fund the wallet's receive address before sending!
  console.log('Fund this address first:', firstAccount.receiveAddress);

  // Example: Send 1 KAS with a custom payload
  await wallet.send({
    amount: '1.0',
    toAddress: 'kaspa:your-destination-address',
    priorityFee: '0.001', // optional
    payload: 'hello from wasm-wrapper', // optional
  });

  if (result.status === 'success') {
    console.log('Transaction sent! TxID:', result.txId);
  } else {
    console.error('Transaction failed:', result.error || result);
  }
}

createAndSend();
```

---

**Note:**
- You must fund the wallet's receive address before sending transactions. Use a Kaspa faucet for testnet.
- All code assumes ES module support and that the WASM SDK files are present.
