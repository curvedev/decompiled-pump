# Readiness record — 21 October 2026

| Area | Verified state |
| --- | --- |
| Project identity | Decompiled Pump · $DEPUMP; no project token created |
| Isolation | New repository/directory and new test roles; existing launchpads/configurations not edited |
| GitHub destination | Public empty repository created under the designated curvedev account; source push pending isolated CLI authorization |
| Research captures | Pump, PumpSwap, Pump Fees finalized bytes, ProgramData/deployment slots, hashes and account configuration recorded |
| Binary analysis | Captured Pump loaded/verified/disassembled by Anza sBPF CLI; 56 IDL discriminator constants located |
| Original runtime tests | Four buys, four sells, four failed-slippage rollback cases executed in LiteSVM against pinned Pump bytes |
| Independent program | sBPF build passes; own System/SPL-only execution path for creation, trades, claims, graduation and pool swaps |
| Protocol validation | 37 initial localhost validator checks; 41 checks against corrected/remapped artifact in LiteSVM, including authorized platform claim |
| Arithmetic/client | Six Rust tests (10,000 randomized cases in one test); eight client/wallet-adapter tests; TypeScript and static build pass |
| Wallet approval validation | Adapter contracts tested with ephemeral mock wallets; actual browser-extension approval flows not verified |
| Browser/layout QA | Static HTTP response verified; browser-control attempts timed out, so rendered desktop/mobile layout is not visually verified |
| Devnet funding/deployment | Two free faucet attempts rate-limited; latest test-wallet balance zero; program not deployed/verified on devnet |
| Public website | Prepared for project GitHub Pages; not published/verified until source access is authorized |
| Mainnet | Not approved, not deployed, no real SOL spent |

Do not treat a target URL, a created repository, a local HTTP server, a compiled binary or a submitted upload as a working public devnet deployment. They have separate checks. Research and code are ready for local review; public operation remains incomplete.

Before publishing, the complete Git index, commit identity/message, proposed history, generated site files and release archive must pass the explicit local privacy checks. Actual results are recorded in `research/release-checks.json` when packaging finishes. Operator keypairs, third-party raw captures and ignored hosting state are excluded.
