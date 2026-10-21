# Mainnet release

The user-approved mainnet deployment completed on 21 October 2026, within the 1.35 SOL cap and with the required local signing/recovery backend. Finalized mainnet executable bytes and the separate upgrade authority were verified before publishing the mainnet frontend at https://depump.fun/. No $DEPUMP project token or mainnet verification coin was launched.

ProgramData: `6uSSracdka2aViBsDNiTBweVhtMZHJc5qjcYj5CriGrL`. Deployment slot: `459649558`. Exact verification is in [mainnet-deployment.json](../research/mainnet-deployment.json).

Actual deployer debit: **0.640361520 SOL**; this includes **0.638906520 SOL** retained in program accounts and **0.001455000 SOL** in network fees. Remaining deployer balance: **0.709638480 SOL**. The upload buffer is closed. See [mainnet-costs.json](../research/mainnet-costs.json) for the balance accounting and its scope.

## Approved separate roles

Each role is a fresh project-only key. Private keypairs are outside the repository and public artifacts. The upgrade authority can replace program behavior; this is a single local signer, not a multisig. The fixed treasury can claim platform fees and cannot withdraw liquidity through this version. Recovery is a separate recipient for specifically identified deployment-buffer refunds or authorized leftover operator funds; it has no pool-withdrawal powers.

- program: `4SBqwENU4drhkJY32ZjpZTtXvhRydVffaxfA3CPR4qgH`
- deployer: `5Hw9fki4du7T4riEMU495yHzRzccVaH6Qt3YrkdAUbGg`
- upgrade_authority: `4pxnJyWVAirN6S7Bkw1c1nNAGQ7nmfsgqzPNSnp8g6Ry`
- treasury: `Gj5G8VAQ35gNyDhB3t39frQ95oeR3UjFsgn2rbpct5uU`
- recovery: `D5LmtoeWdqukY88bZFTgyj5tBC9jSLsP62zBnRD4uDB1`

Private custody backup/handoff must be completed separately without publishing keys. A public source archive is not a key backup. Funding transactions publicly link the sender to the new deployer; fresh keys do not hide that linkage.

## Reviewed configuration and costs

- Domain: `depump.fun`, with Namecheap domain privacy enabled.
- Mainnet curve starts with 30 SOL virtual quote reserve, versus 0.03 test SOL on devnet. This is pricing state, not an operator deposit. A single full-curve purchase would supply approximately 85.005 SOL before fees; actual multiple-trade totals depend on rounding. No operator liquidity seed is required.
- Fixed 0.75% platform and 0.25% creator curve fees; pool swaps add 0.30% retained liquidity fees. Fixed one-billion-token supply; six decimals; mint authority revoked and no freeze authority.
- Deployed binary: 125432 bytes, SHA-256 `24288be397ade5b5fddeb452b3749bd6f9401e019244ea1f0285db3d9c750530`.
- Mainnet-quoted program/ProgramData rent: 0.638906520 SOL.
- Quoted temporary peak with upload buffer: 1.276939280 SOL.
- Modeled base upload fees: 0.001500 SOL, assuming two signatures per modeled upload transaction and zero priority price. Fees/retries can vary.
- Approved total deployer funding: **1.35 SOL**, including upload peak, limited verification headroom and unspent reserve. This is not a claim that all 1.35 SOL is permanently spent.
- Maximum metadata coin-account rent: 0.02569972 SOL, plus network fees and any user token account. Users fund their own launches. No project token or paid provider is enabled.
- Static hosting and public RPC have no configured subscription. Public RPC can rate-limit; this is a small experimental release, with no capacity guarantee.

The upload buffer can be refunded to its actual authority's chosen recipient if validly abandoned; inspect its chain owner/authority first. Eligible ProgramData rent (currently 0.638073400 SOL) is recoverable only under loader retirement conditions. The small Program account remains, retaining 0.000833120 SOL at the quoted rent. ProgramData closure disables the protocol and can strand user funds. Founding pool liquidity, user deposits, mint rent and launch-state/metadata rent have no operator recovery instruction. Transaction fees are nonrefundable.

## Operator recovery

The user additionally required a backend recovery path before deployment. [operator-recovery.md](operator-recovery.md) documents the local prepare/sign/submit flow. It recovers eligible operator wallets, the project upload buffer, fixed-treasury fee claims and ProgramData rent only when retirement will not strand launched coins. Seven recovery contract tests and eight native-loader/System Program execution checks pass locally. Transaction fees and user/pool funds are excluded.

## Validation and release gates

The exact mainnet candidate passed 42 local protocol checks, including separate treasury claims, initial reserve agreement, slippage rollback, conservation, graduation and pool swaps. Six Rust tests passed, including 10,000 arithmetic round trips. Ten client/wallet/network tests pass in both network modes. Real extension-wallet approvals, physical devices, broad adversarial concurrency and independent security review remain unverified; this is not an audited release.

`python3 scripts/build-program.py --network mainnet` builds a separate artifact in `target/mainnet`. `DEPUMP_NETWORK=mainnet npm run build` builds a mainnet-labeled frontend. Wallet chain identifiers, genesis hash, program, treasury, pending launch storage, watchlists and explorer links are network-specific.

`python3 scripts/mainnet-control.py preflight` rechecks the mainnet genesis, current rent, candidate hash, existence and public role balances without signing. `verify` requires finalized loader state, exact executable bytes, the selected upgrade authority and the tested binary hash. Public mainnet packaging invokes that verification before copying assets into Pages. It fails while the program is absent or its finalized bytes/authority differ.

The deploy action additionally requires an explicit private approval record matching every role, exact binary hash and 1.35 SOL budget, and verifies all signer public keys. It uses the named private upload buffer, exact maximum program size, one signing round and zero priority fee. Failures are recorded only in private diagnostics. An interrupted upload can be resumed with the bounded uploader after inspecting that specific buffer and the remaining approved balance. The finalization action accepts only an exact byte-complete buffer and explicit approval. Upgrades, immutability changes, program closures and reserve changes require a separate review.
