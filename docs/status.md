# Readiness record — 21 October 2026

| Area | Verified state |
| --- | --- |
| Project identity | Decompiled Pump · $DEPUMP; no project token created |
| Isolation | New repository/directory and new test roles; existing launchpads/configurations not edited |
| GitHub destination | Public source published under the designated curvedev account; author and committer are Anonymous |
| Research captures | Pump, PumpSwap, Pump Fees finalized bytes, ProgramData/deployment slots, hashes and account configuration recorded |
| Binary analysis | Captured Pump loaded/verified/disassembled by Anza sBPF CLI; 56 IDL discriminator constants located |
| Original runtime tests | Four buys, four sells, four failed-slippage rollback cases executed in LiteSVM against pinned Pump bytes |
| Independent program | sBPF build passes; own System/SPL-only execution path for creation, trades, claims, graduation and pool swaps |
| Protocol validation | 37 initial localhost validator checks; 41 checks against corrected/remapped artifact in LiteSVM, including authorized platform claim |
| Arithmetic/client | Six Rust tests (10,000 randomized cases in one test); ten client/wallet/network tests in each network mode; TypeScript and static build pass |
| Wallet approval validation | Adapter contracts tested with ephemeral mock wallets; actual browser-extension approval flows not verified |
| Browser/layout QA | User-selected Reverse Engineered Pump board/create/coin/source layouts, watchlist, search, preview/image conversion, chart metrics and quotes checked; 390-pixel CSS layout checked in an iframe; physical mobile devices and actual wallet approvals remain unverified |
| Devnet funding/deployment | Official faucet supplied 2.5 free test SOL; finalized program bytes and upgrade authority verified; TEST coin completed nine finalized lifecycle transactions including claims, graduation and pool swaps |
| Public website | GitHub Pages build succeeded; public HTML matches the prepared mainnet build; only genuine accounts on the selected network are shown |
| Mainnet | Finalized program `4SBqwENU4drhkJY32ZjpZTtXvhRydVffaxfA3CPR4qgH` exactly matches the tested artifact; separate roles; 30 SOL virtual reserves; 42 protocol checks; seven recovery contract tests, eight native recovery checks and eight native upload checks; actual debit 0.640361520 SOL within the approved 1.35 SOL cap; no mainnet coin launched |

Public mainnet site: https://depump.fun/. Mainnet verification and costs are in `research/mainnet-deployment.json` and `research/mainnet-costs.json`. The following records describe the separate historical devnet verification. Program verification is in `research/devnet-deployment.json`; exact test signatures are in `research/devnet-smoke-results.json`. The test coin is TEST, not a project token. The smoke test resumed the same coin after a public-RPC rate limit. Fifteen assertions ran in the resumed final pass, in addition to the nine finalized transactions. Distinct-role authorization remains covered by local tests; one dedicated operator signs this devnet smoke test.

The published mainnet program remains upgradeable by its separate mainnet authority. This is experimental mainnet operation, with no audited or production-readiness claim.

The complete Git index, commit identity/message, proposed history, generated site files and release archive pass explicit local privacy checks before sharing. Results are recorded in `research/release-checks.json` and the packaged release manifest. Operator keypairs, third-party raw captures and ignored hosting state are excluded.
