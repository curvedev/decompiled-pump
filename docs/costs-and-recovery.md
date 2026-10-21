# Costs and recovery

No real SOL has been spent. No paid RPC, subscription, higher usage limit or unbounded metered storage service was enabled. The executable rent quote in [rent-estimate.json](../research/rent-estimate.json) is a read-only **mainnet-beta** RPC result for the exact quoted binary on 21 October 2026. Requote the final artifact and actual network before spending.

## Concrete estimate

The roughly 126 KB artifact needs about **0.64 SOL** of permanent program/program-data rent exemption and roughly **1.28 SOL** of temporary peak balance while a full upload buffer coexists. Exact lamport amounts and byte sizes are in the JSON. Deploying with the wrapper's explicit maximum length avoids silently budgeting twice the binary size for future upgrades. A larger upgrade can require more rent.

At 900 uploaded bytes per write, the rough base-fee estimate is around **0.00075 SOL** for upload/finalization, assuming one 5,000-lamport signature per estimated transaction plus ten extra signed operations. This is a budgeting model, not a transaction count guarantee; retries, additional signers, account operations, congestion and priority prices change the result. Priority price is zero in the devnet wrapper. Solana's [fee documentation](https://solana.com/docs/core/fees) distinguishes nonrefundable transaction fees from rent exemption.

A coin with maximum 4,096-byte metadata needs about **0.0257 SOL** of mint/vault/state/metadata rent at the quoted rates, plus roughly 0.00149 SOL if the buyer needs a new token account. Typical smaller metadata costs less. A full upload uses one creation, at most seven 600-byte metadata writes, and one seal/optional-buy transaction: around 0.00005 SOL of base signature fees, excluding retries and additional operations. These amounts are estimates from current rent, not a fixed launch charge.

The independent pool uses the existing accounts, so graduation creates no new AMM accounts. Its liquidity consists of the reserved **206.9 million tokens** and actual SOL accumulated from curve purchases. At the devnet parameters, a single full curve purchase raises about **0.085 SOL** before separate fees. With a hypothetical 30 SOL virtual starting reserve, the analogous single-purchase quote is about **85.005 SOL**; those are user-supplied trading reserves, not an operator setup fee or an approved mainnet configuration. Multiple trades and rounding affect the final amount. No operator seed purchase is required for this design.

Recurring baseline: static public GitHub Pages and the free public devnet RPC, **zero paid subscription configured**. Free endpoints have availability/rate limits. No paid service is preapproved. Mainnet requires explicit review of actual rent, fee-payer funding, liquidity policy, hosting/RPC capacity and separate wallet roles; no USD conversion or token-price assumption is made here.

## What can be reclaimed, by whom, and when

| Asset/account | Who can act | Current recovery conditions |
| --- | --- | --- |
| Unspent operator-wallet SOL | Wallet signer | Ordinary wallet transfer; on the actual network where funds exist |
| Unused or abandoned deployment buffer | Buffer authority | Inspect its ownership/authority and active upload status; close that specific buffer to an explicitly chosen recipient |
| Upgradeable ProgramData rent | Actual upgrade authority | Program closure permanently disables execution; consider only after a verified retirement and accounting for every user-owned obligation. Closure is not an application liquidity recovery method |
| Program-address rent | Loader/CLI-dependent | Do not promise its separate recovery; inspect actual loader state and current close behavior |
| Creator fee liability | Coin's creator signer | Claim only the recorded creator-fee amount |
| Platform fee liability | Fixed treasury signer | Claim only the recorded platform-fee amount |
| User token-account rent | Token-account authority | Standard SPL close conditions, including a zero token balance where required |
| Mint rent | Nobody through v0.1 | Legacy mint has no close instruction in this implementation |
| Coin state / metadata rent | Nobody through v0.1 | No account close instruction, including unsealed/abandoned launches |
| Curve trading SOL and reserved tokens | Protocol trading rules | No operator withdrawal or blanket refund path |
| Founding pool liquidity and later pool deposits from swaps | Protocol trading rules | No LP mint, LP withdrawal or emergency operator drain instruction |
| Unsolicited token/SOL donations | Nobody through v0.1 | Not included in accounted reserves; no excess-recovery instruction |

## Operator procedure

1. Verify cluster genesis, program ID, ProgramData address, deployed hash, upgrade authority, buffer authority, target recipient and balances. Use explicit RPC/keypair flags; never rely on an existing global CLI default. Keep this inspection private if its output contains local paths or signer locations.
2. For an interrupted deployment, inspect that exact buffer and resume the upload when valid. If abandoning it, its authority can close the **specific buffer** using `solana program close <BUFFER_ADDRESS> --url devnet --authority <PRIVATE_AUTHORITY_PATH> --keypair <PRIVATE_FEE_PAYER_PATH> --recipient <PUBLIC_RECIPIENT>`. Do not broadly close all buffers or close an active program by mistake.
3. Verify the transaction and recipient balance before counting rent as recovered. Transaction fees remain spent. A lost authority key is not recoverable from a repository, program ID or deployment transaction.
4. Retire a program only after a separate explicit decision. Current CLI help calls closure permanent. Never use `--bypass-warning` as routine recovery. Closing or making a program immutable can remove the ability to repair it and can strand funds governed by that code.
5. Claims are separate from liquidity. Neither an upgrade-authority key nor a treasury key implies rightful ownership of trader deposits. This release provides no promise that user deposits, pool liquidity or launch-account rent can be refunded by an operator.
