# Security and readiness limits

This is experimental devnet software, not a completed audit or a mainnet launch recommendation. The user has requested mainnet preparation; real SOL expenditure still awaits approval of the specific budget and wallet roles. No project-token launch is authorized.

Validated locally: fixed supply and absent freeze authority; metadata commitment/sealing and creator authorization; buy/sell slippage failure and rollback; wrong vault and signer rejection; separate fee liabilities; unauthorized claim rejection; duplicate claim rejection; graduation gating/idempotency; pool swaps; token/SOL conservation and pool-product behavior in the tested paths. Unit tests exercise arithmetic edges and 10,000 deterministic randomized curve round trips. Results have finite scope.

Unresolved: extension-wallet/browser end-to-end approvals, adversarial multi-transaction concurrency and front-running analysis, large-population indexing, upgrade governance, and independent security review. Original-program creation, creator claims, administrative changes, graduation, synthetic migration, reward modes, non-SOL pairs, and PumpSwap execution were not equivalence-tested. Static discriminator/string evidence does not validate those paths.

The current program deliberately has no metadata close, mint recovery, liquidity withdrawal, emergency reserve withdrawal, pause, or mutable-fee instruction. Failed/abandoned creation rent can remain locked. A pool's founding liquidity and user deposits cannot be reclaimed by an operator through v0.1. SPL token holders can manage their own token accounts under SPL rules. The upgrade authority remains capable of replacing program behavior; it must be reviewed before mainnet, and code immutability claims must reflect actual chain state.

Before mainnet: review the complete deployed artifact and authority roles, recheck invariants with a broader independent review, complete wallet tests and devnet operations, choose production reserve/fee parameters, reprice rent and transaction fees, approve actual costs, and document governance/recovery. The current devnet role keys are not implicitly approved for mainnet.

Do not commit credentials, keypairs, signed operator state, machine paths, or provider IDs. Runtime test signers are generated outside shared source. The public research excludes third-party raw binaries and copied source/IDL files pending redistribution review.

Privacy checks reduce accidental attribution; they are not a guarantee of anonymity. GitHub publicly displays the designated project account, and service providers can retain account/network information. Local checker patterns must be run explicitly, and do not configure other computers, erase prior exposure, or establish that every future upload is safe.
