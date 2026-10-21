# Architecture

`programs/depump` owns mint initialization, supply, reserve accounting, fee claims, phase transition, and AMM trades. The frontend has no privileged execution route. Users sign transactions; the program validates custody and limits. Its allowed CPI destinations are hardcoded System and legacy SPL Token IDs.

`web/protocol.ts` is an independent bigint client and byte-layout encoder. `web/client.ts` reads genuine program accounts, verifies metadata hashes, simulates, prepares transactions, and sends bounded retries. `web/wallet.ts` discovers installed compatible wallets using Wallet Standard. Wallet account selection and transaction signing occur in the wallet.

Before signing, the client checks the devnet genesis hash and the independent program's executable flag. A locally configured localhost build is explicitly labeled Local validator. A missing deployment, unavailable RPC, empty listing, and missing trade history have distinct visible states. No sample coins stand in for on-chain data.

Creation has one user action. Preparation commits the metadata hash, builds bounded upload chunks, checks packet lengths, simulates the first operation, and requests a wallet-signed batch. Dependent transactions are then broadcast in order with preflight enabled. The final seal/optional developer buy is atomic. Standard-wallet implementations may show more than one approval UI for a batch; one prompt is not guaranteed across wallets.

Only public pending metadata and mint address are stored locally for recovery. Private mint material exists in memory only until the first transaction is signed. Resuming an existing mint uses its public address and creator signature. Identical signed retries retain the same transaction ID. If confirmation is uncertain, the UI exposes the transaction ID; it does not silently issue a new economic trade. On resume, sealed state proves the final atomic step has already landed.

Images become small re-encoded WebP thumbnails. No remote image-storage service or API credential is needed. Canvas encoding removes the source container and its metadata; original file names are not stored. The image and description remain public on-chain.

Each coin has a dedicated hash route, a copyable mint, balances, reserve-derived spot price and SOL market cap, curve progress, fees, claims, and transaction status. Buy amounts are selected within a user SOL budget, reserving the chosen slippage allowance; sell limits are minimum net SOL. Quotes use bigint. Display-only prices may use floating point.

The chart shows at most 16 recent successful transactions from a bounded 30-signature lookup. Trade log parsing tracks the program invocation stack so another program cannot spoof our event prefix. These are fill prices, not candles or complete history. A bounded 15-second cache reuses recent history when switching buy/sell tabs; a confirmed trade clears it. An indexer, archival candle service, and pagination beyond the first 100 metadata fetches are future work. Listing enumeration itself comes from getProgramAccounts and can encounter public-RPC limits.

The site is static, served from the designated project GitHub namespace. It uses system fonts, inline original graphics and on-chain thumbnails; no analytics or remote font service is configured. No paid service is enabled. The free public RPC can rate-limit or decline enumeration; a separate review would be required before adding a paid provider.
