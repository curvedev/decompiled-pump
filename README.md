# Decompiled Pump · $DEPUMP

An independent experimental Solana launchpad and a public record of deployed-program research. Not affiliated with Pump.fun. **No $DEPUMP project token has been launched.**

## Current status

- Native Rust program builds to sBPF. Coin creation, curve buys/sells, separate fee claims, explicit graduation, and independent post-graduation swaps are implemented.
- Six Rust tests, including 10,000 randomized arithmetic cases; eighteen client/wallet/network/discovery tests in each network mode; 42 protocol checks against the mainnet artifact in LiteSVM. Seven recovery contract tests, eight native recovery checks and eight native upload checks pass. The actual client also passes a native interrupted-launch/resume regression. Updated verification results are recorded in `research/`.
- Pump, PumpSwap, and Pump Fees executables were captured and hashed. The Pump executable was disassembled with Anza's sBPF tool. Four buys and four sells ran against that captured executable in LiteSVM, with fee observations and failed-slippage rollback checks.
- [Public mainnet launchpad](https://depump.fun/) uses the finalized, byte-verified mainnet program and separately held operator roles. No mainnet coin was launched during deployment. The prior devnet TEST coin completed nine finalized lifecycle transactions. See [mainnet verification](research/mainnet-deployment.json), [status](docs/status.md), and the separate [devnet results](research/devnet-smoke-results.json).
- User-selected Reverse Engineered Pump interface: classic board, bracket navigation with GitHub links, coin search, watchlist, live create preview, and chart/trade panels. Desktop and 390-pixel CSS layouts were browser-checked; actual extension-wallet approvals and physical mobile devices remain unverified. See [interface recreation](docs/interface.md).
- REA was explicitly waived. We do not claim recovered original source, a byte-for-byte rebuild, a completed security audit, or complete equivalence.

## Build and run

Requirements: Node.js 24+, npm, Rust, and Agave/Solana `cargo-build-sbf` (tested with CLI 4.3.2, build helper 4.4.0, platform tools 1.57). Dependencies are pinned in the lockfiles. The program uses the Solana 2.3 / legacy SPL Token 8 interfaces deliberately; frontend web3 is pinned to its compatible 1.x interface.

```sh
npm ci
cargo test --workspace
python3 scripts/build-program.py
npm run test:client
npm run build
npm run dev
```

Development builds default to devnet. The published mainnet frontend is built with `DEPUMP_NETWORK=mainnet npm run build` and checks the full mainnet genesis hash before signing. `python3 scripts/build-program.py --network mainnet` produces the separately compiled mainnet executable. For a **local-only** preview, set `VITE_RPC_URL=http://127.0.0.1:8899`. Never publish a frontend build configured for a local validator.

The mainnet browser uses the public PublicNode endpoint and paginated, account-validated launch discovery; see [browser RPC and listing scope](docs/interface.md#mainnet-browser-reads). Operator tools keep their pinned official RPC.

The default esbuild build generates `dist/`, with content-versioned relative asset URLs and source maps disabled. `scripts/package-pages.py` copies the build into `docs/` for GitHub Pages while preserving protocol documentation. No server, database, account login, paid RPC, or upload service is required. Coin thumbnails and metadata are stored on-chain; the browser downsizes and re-encodes images before signing. `npm run dev` builds and serves on loopback port 5187; rebuild and refresh after editing.

## Local transaction verification

Start a fresh, disposable validator with an explicitly named local mint:

```sh
solana-test-validator --reset --ledger .operator/local-ledger \
  --bind-address 127.0.0.1 --rpc-port 8899 \
  --mint GAjNZJrEC48Dc7Y1N8foJnbrknRbVTuGJXpdL13npmrb \
  --bpf-program 8pCWBPUbkivA94J2dLC4rzJmx7kHGrV3qD378DkhAM71 target/deploy/depump.so
npm run test:chain
```

`test:chain` refuses remote URLs, generates temporary runtime signers, obtains local test SOL, and checks both successful execution and rejected operations. It never launches a $DEPUMP token. Mainnet transactions are outside this workflow.

## Reproduce the research

```sh
python3 scripts/fetch-public-inputs.py
python3 scripts/capture_program.py
node --import tsx scripts/prepare-replay.ts
npm run test:original:lite
```

The capture uses **current** finalized accounts. If Pump upgrades, an RPC cannot normally return the old executable from a deployment slot; the pinned manifest must not be silently replaced. Keep original local captures or obtain an archive from a trusted source and verify the recorded hash. `research/raw/` stays ignored; third-party program binaries and copied documentation are not redistributed by this repository. The setup script downloads the official IDLs at documentation commit `639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22`.

For disassembly, build Anza's `sbpf_cli` at the commit recorded in [dispatch-map.json](research/dispatch-map.json), then run `python3 scripts/analyze-binary.py --sbpf-cli /path/to/sbpf_cli`. It produces local assembly and the narrow, attributable observations used by the ledger. This is disassembly, not recovered Rust source.

## Read further

- [Protocol and intentional differences](docs/protocol.md)
- [Architecture and wallet flows](docs/architecture.md)
- [Research feasibility and limitations](research/feasibility.md)
- [Evidence ledger](research/evidence-ledger.json)
- [Security and validation limits](SECURITY.md)
- [Deployment and wallet roles](docs/deployment.md)
- [Mainnet release and costs](docs/mainnet.md)
- [Local signed operator recovery](docs/operator-recovery.md)
- [Costs and recovery](docs/costs-and-recovery.md)

MIT covers this repository's original implementation. Third-party dependencies retain their licenses; [notices](THIRD_PARTY_NOTICES.md) distinguish research subjects from our code.

## Mainnet release

The finalized mainnet program, separate public wallet roles, exact executable hash, actual costs, local recovery backend and limitations are recorded in [docs/mainnet.md](docs/mainnet.md). The program remains upgradeable and has not received an independent audit. No project token or verification coin was launched.

Current release checks and the remaining wallet/custody handoff are in [launch readiness](docs/launch-readiness.md).
