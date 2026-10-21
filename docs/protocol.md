# Protocol v0.1 — experimental devnet

Program: `8pCWBPUbkivA94J2dLC4rzJmx7kHGrV3qD378DkhAM71`. This is a project-specific address, not a Pump/PumpSwap address. Its deployment status is recorded separately.

## Creation and custody

The creator signs. A new mint also signs initialization. Coin state is the PDA `["coin", mint]`; the token vault is `["vault", mint]`; metadata is `["meta", mint]`. All are derived under our program. System and legacy SPL Token are the only CPI destinations. No Pump SDK or program is used by the application.

The program creates a six-decimal SPL mint and mints exactly `1,000,000,000,000,000` base units (1 billion tokens) to the vault. It removes mint authority, sets no freeze authority, and retains token-vault custody in the coin PDA.

Metadata is a JSON document capped at 4,096 bytes, with its length and SHA-256 committed during creation. Only the creator can write bounded chunks before sealing. The creator seals only when the whole document matches the committed hash. Trading requires sealed metadata. Metadata cannot be edited after sealing. On-chain bytes are not inherently safe HTML; the frontend verifies the hash, escapes text, permits HTTPS socials, and permits only supported raster data URLs.

Creation is staged across a wallet-signed batch because Solana packets cannot contain a normal image in one transaction. The final seal and optional initial developer buy share one atomic transaction. An interrupted upload can be resumed by its creator; no private mint key is needed after the mint exists. An orphaned unsealed launch has no current close/refund instruction.

## Curve phase

Initial reserves, in base units:

| Field | Value |
| --- | ---: |
| Virtual token reserve X | 1,073,000,000,000,000 |
| Virtual SOL reserve Y | Devnet: 30,000,000 lamports (0.03 SOL); mainnet candidate: 30,000,000,000 lamports (30 SOL) |
| Sellable real token reserve | 793,100,000,000,000 |
| Real SOL reserve | 0 |
| Tokens reserved for graduation | 206,900,000,000,000 |

The smaller SOL reserve is an explicit devnet difference: Pump's captured Global has 30 SOL, 1,000 times this value. Virtual SOL is a pricing parameter, not a real deposit.

For an exact base-token buy A:

`gross_quote = floor(Y * A / (X - A)) + 1`

This rounding is supported by the four original-program buy cases, including an exact-divisibility case where a plain ceiling differs. Amount must be positive, below X, and no more than the remaining real token reserve. Update X and real token inventory by -A; update Y and real SOL by +gross_quote. Fees are additional. The caller supplies a fee-inclusive maximum SOL amount.

For a sell of A base units:

`gross_quote = floor(Y * A / (X + A))`

Update reserves in the inverse direction. Gross quote must be covered by real SOL. Deduct fees from proceeds. The caller supplies a minimum net SOL amount. Zero gross/net outputs are rejected here; the captured original allowed a zero-gross one-base-unit sell in our test, so this is an explicit difference.

Products and division use u128 intermediates, with checked u64 results. Overflow, invalid phase, insufficient reserves, bad ownership, signer failures, and slippage fail atomically.

## Fees and claims

Our fixed fee schedule is **0.75% platform + 0.25% creator**, each rounded up independently from gross quote. It is an intentional difference from Pump's configurable tiered schedule, buyback splitting, reward modes, and fee sharing. No claim of exact fee equivalence is made.

SOL fees stay in the coin account as separate creator/platform liabilities and do not enter pricing reserves. Only the creator can claim creator fees, and only the fixed project treasury can claim platform fees. Claims require the recipient's signature and clear the corresponding liability atomically. No claim can remove pricing reserves or the rent floor. The treasury for this devnet build is `GAjNZJrEC48Dc7Y1N8foJnbrknRbVTuGJXpdL13npmrb`.

## Graduation and independent pool

The buy exhausting real curve inventory completes the curve. Further curve trades stop. Anyone can submit Graduate once metadata is sealed, real token inventory is zero, and real SOL is positive. Graduate is idempotent. It assigns all **accounted real SOL** and the 206.9 million reserved tokens to the pool phase under the same PDA. No external AMM CPI or operator liquidity seed is needed.

After graduation, X and Y are actual accounted token/SOL pool reserves. Exact-token buys cost `ceil(Y*A/(X-A))`; sells return `floor(Y*A/(X+A))` before fees. The same platform/creator fees apply, plus a separate 0.30% fee retained in the pool, rounded up. The pool product is nondecreasing for accepted trades.

No LP token is issued and no liquidity withdrawal/deposit instruction exists in v0.1. Founding liquidity is locked by the current program. This differs from migration to PumpSwap with burned LP tokens. There is a discontinuity between the final virtual-curve price and the real-reserve pool price; the UI must display the phase and the new reserve-derived price. We do not claim Pump's synthetic-crossing behavior or cross-phase equivalence.

Unsolicited SOL/token donations do not change accounted reserves and have no recovery instruction. The program preserves its rent floor. An upgrade authority can change future code; therefore economic locking depends on the deployed code and its upgrade policy, not just this specification.

## Instruction encoding and state

Borsh enum tags: 0 Create(u16 length, [u8;32] hash), 1 WriteMetadata(u16 offset, Vec<u8>), 2 Seal, 3 Buy(u64 amount,u64 max), 4 Sell(u64 amount,u64 min), 5 Graduate, 6 ClaimCreator, 7 ClaimPlatform. The source documents exact account order. Unknown tags fail.

Coin state is exactly 204 bytes: magic `DEPUMP01`, creator/mint/vault (32 bytes each), phase u8; eight u64 reserve/fee fields; metadata hash 32 bytes; metadata length u16; sealed bool. TypeScript decoding tests the magic, size, and coin PDA. Owner checks are performed by the RPC client and the on-chain program.

There is no configurable admin instruction. The upgrade authority remains the administrative risk. Mainnet roles and code must be separately reviewed; this devnet treasury must not be adopted as an approved mainnet role implicitly.
