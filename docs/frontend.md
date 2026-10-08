# Veritas — Frontend Guide

## Stack

| Layer | Technology |
|---|---|
| Framework | React 18 + Vite + TypeScript (strict) |
| Routing | react-router-dom v7 |
| Styling | Tailwind CSS v3 + custom design tokens |
| GenLayer SDK | genlayer-js 1.1.8 |
| Fonts | Space Grotesk (headings), DM Sans (body), JetBrains Mono (addresses/hashes) |

---

## Component Tree

```
App.tsx (BrowserRouter)
├── Navbar.tsx
│   └── WalletButton.tsx
├── / → HomePage.tsx
│   └── StatusBadge.tsx
├── /create → CreateDisputePage.tsx
├── /dispute/:id → DisputeDetailPage.tsx
│   └── StatusBadge.tsx
└── /profile → ProfilePage.tsx
```

---

## Wallet Hook (`src/genlayer/useWallet.ts`)

```ts
const {
  address,      // string | null — connected wallet address
  isConnected,  // boolean
  isWrongChain, // boolean — true when MetaMask is on the wrong network
  connect,      // () => Promise<void>
  disconnect,   // () => void
  switchNetwork // () => Promise<void>
} = useWallet();
```

- On mount, silently reconnects if MetaMask was previously connected.
- Listens to `accountsChanged` and `chainChanged` events.
- `connect()` calls `ensureChain()` which adds StudioNet to MetaMask if needed.

---

## Contract Client (`src/genlayer/client.ts`)

```ts
// Instantiate (reads and writes)
const contract = new VeritasContract(CONTRACT_ADDRESS, walletAddress);

// Reads (no wallet needed)
const dispute = await contract.getDispute(disputeId);
const claim   = await contract.getClaim(claimId);
const ids     = await contract.getDisputeClaimIds(disputeId);
const info    = await contract.getContractInfo();

// Writes (wallet + StudioNet required)
const receipt = await contract.createDispute(title, desc, stakeWei, filingWindow, challengeWindow);
const receipt = await contract.fileClaim(disputeId, artifactUrl, type, hintUrl, stakeWei);
const receipt = await contract.triggerEvaluation(disputeId);
const receipt = await contract.submitChallengeEvidence(claimId, evidenceUrl);
const receipt = await contract.finalizeDispute(disputeId);
const receipt = await contract.withdraw(claimId);
const receipt = await contract.claimSingleFilerRefund(disputeId);
const receipt = await contract.cancelDispute(disputeId);
const receipt = await contract.claimDisputeTimeout(disputeId);
```

All writes call `ensureChain()` before submitting, estimate fees via `estimateWriteFeePreset`, and poll `waitForTransactionReceipt` with `{retries: 80, interval: 5000}`. On timeout, a `TimeoutError` is thrown carrying the tx hash and a direct explorer link.

---

## Design Tokens (`src/index.css`)

| Token | Value | Usage |
|---|---|---|
| `--accent` | `#7c3aed` (electric violet) | Primary CTA, active states |
| `--accent-light` | `#a78bfa` | Hover, secondary highlights |
| `--bg` | `#0d0f1a` (deep navy) | Page background |
| `--surface` | `#141624` | Card backgrounds |
| `--surface-2` | `#1c1f33` | Input fields, table rows |
| `--border` | `#2a2d47` | Dividers, card borders |
| `--text` | `#e2e8f0` | Primary text |
| `--text-muted` | `#64748b` | Secondary text |

---

## Pages

### `HomePage`
- Hero section with animated stats strip (total disputes, total claims, total staked)
- Live dispute feed table (reads from contract; falls back to demo data when no contract)
- Quick-start call-to-action

### `CreateDisputePage`
- Form: idea title, description, stake amount (GEN), filing window, challenge window
- Autofill sample button for testing
- Gas estimation before submit

### `DisputeDetailPage`
- Full lifecycle view: dispute header, status timeline, claim list, active action panel
- Actions available depend on current status and wallet address:
  - `FILING_OPEN`: file a claim, cancel (creator only)
  - `VALIDATING`: trigger evaluation (after deadline)
  - `RANKED`: submit challenge evidence (own claim only), finalize (after challenge deadline)
  - `FINALIZED`: withdraw (winner only)
  - `INCONCLUSIVE`: withdraw own stake
  - Timeout paths: single-filer refund, dispute timeout
- `TimeoutError` shown with explorer link so user can track tx independently

### `ProfilePage`
- Wallet-scoped view: instructions to use the explorer to find their transactions
- Links to explorer address page
- Explanation of the no-backend limitation

---

## Config (`src/genlayer/config.ts`)

```ts
export const STUDIONET_RPC      = "https://studio.genlayer.com/api";
export const STUDIONET_CHAIN_ID = 61999;
export const CONTRACT_ADDRESS   = "0x27b38C74B2066D731Ca98169424730B93F23047C";
export const EXPLORER_TX_URL    = (hash: string) => `https://explorer-studio.genlayer.com/tx/${hash}`;
export const EXPLORER_ADDR_URL  = (addr: string) => `https://explorer-studio.genlayer.com/address/${addr}`;
```

---

## Format Utilities (`src/utils/format.ts`)

```ts
shortAddr(addr: string)              // "0x1234...abcd"
formatGen(wei: bigint)               // "1.5 GEN"
formatTs(unixSeconds: number)        // "Oct 5, 2026, 14:32"
formatCountdown(unixSeconds: number) // "2h 15m" or "Expired"
```
