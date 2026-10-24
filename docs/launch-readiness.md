# Launch readiness — 24 October 2026

The application is live on experimental mainnet at https://depump.fun/. The independent program is `4SBqwENU4drhkJY32ZjpZTtXvhRydVffaxfA3CPR4qgH`. No $DEPUMP project token or mainnet verification coin has been created. A broad public launch is not fully signed off until the wallet and custody handoff below is complete.

## Verified release

- Finalized executable bytes, deployment signature and separate upgrade authority match `research/mainnet-deployment.json`; binary SHA-256 is `24288be397ade5b5fddeb452b3749bd6f9401e019244ea1f0285db3d9c750530`.
- The operator deployer holds 0.709638480 SOL at this check. Deployment net debit was 0.640361520 SOL, within the approved 1.35 SOL cap. No new mainnet transaction was sent during these readiness checks.
- Eighteen client/wallet/network/discovery checks pass in both network modes. Six mainnet Rust tests pass, including 10,000 arithmetic round trips. The existing 42-check mainnet protocol report is retained; the current local rerun passes 38 checks without loading the separate treasury private key.
- The actual client passes a native mainnet-artifact test: approvals receive fresh blockhashes, metadata creation survives an interruption and resumes, hashes match, the optional initial buy executes, and an already sealed launch cannot repeat that buy. All signers and transactions stay in the synthetic local bank.
- Seven recovery contract tests and eight native recovery checks pass. The retirement test reconstructs a fresh bank from actual remaining accounts; it does not model warm-cache invalidation across banks.
- The website build passes TypeScript checking and contains no source maps. Browser listings use genuine confirmed activity. Refresh catches up through new activity while preserving the older-listing cursor. Discovery is paginated and uses a rate-limited public RPC, rather than a complete real-time indexer.

## Wallet and custody handoff

1. Run a real Wallet Standard extension test on devnet first. Build with `npm run build`, serve `dist/` on localhost, and open it in the browser containing the wallet. Confirm the network reads devnet. Create a TEST coin with test SOL, interrupt one approval and resume, then buy, sell and claim creator rewards. Check the explorer links and balances. The native client test does not replace wallet-extension approval testing. Physical devices also remain unverified.
2. Back up the private operator folder in encrypted storage you control, keeping its password separate. Verify the backup can be read before relying on it. Retain deployer, upgrade-authority, treasury and recovery keys; source archives contain none of them. The private custody guide identifies all six files. Never upload them or paste their contents into chat. An encrypted backup and restore check have not been completed by this release.
3. Review `docs/operator-recovery.md`. Recovery is explicit prepare → review → sign → submit; nothing automatically withdraws when the project stops. It covers eligible project-wallet balances, platform fees and eligible ProgramData retirement rent. It does not recover trading/pool reserves, paid transaction fees or the small Program account rent. Retirement refuses launched coins.

The program remains upgradeable by a separate single local authority. There is no independent audit or broad adversarial concurrency/front-running sign-off. The attempted Codex Security scan could not start because its tool returned “Could not snapshot the selected working-tree changes”; no completed scan report exists. The prior experimental-mainnet approval does not establish these checks as completed.

Launching a project token, changing contract code or authority, retiring the program, and spending additional mainnet SOL require their own concrete instructions. The public GitHub namespace and on-chain funding links remain visible despite anonymous commit attribution.
