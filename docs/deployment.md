# Deployment and wallet roles

This release is **devnet-only**. No mainnet deployment or project token launch is authorized.

## Current project identities

| Role | Devnet public address | Control |
| --- | --- | --- |
| Independent program | `8pCWBPUbkivA94J2dLC4rzJmx7kHGrV3qD378DkhAM71` | Program-address signer used only during deployment |
| Deployer / upgrade authority / platform treasury | `GAjNZJrEC48Dc7Y1N8foJnbrknRbVTuGJXpdL13npmrb` | Separate local project key, excluded from source and deliverables |
| Coin creator | User's selected wallet | Receives only that coin's accrued creator fees |
| Trading wallet | User's selected wallet | Approves buys/sells and controls received tokens |

The combined devnet operator roles are a routine test choice, not an approved mainnet wallet design. Mainnet requires separately named fee payer, upgrade/governance authority, treasury recipient and recovery recipient. Program IDs, genesis checks and treasury constants must be reviewed together before any new network.

## Build, fund, deploy

1. Build with `python3 scripts/build-program.py`. This passes anonymous home-directory remap flags and rejects a resulting executable containing a builder home path.
2. Obtain free test SOL from [Solana's official faucet](https://faucet.solana.com). Around 2 test SOL gives upload headroom for this artifact. Never send mainnet SOL to satisfy a devnet funding request.
3. Inspect the finalized artifact, rent estimate and public role keys. Private project keypairs stay outside source. For a fresh fork, generate new keys outside the repository, change `identity.rs` and `web/protocol.ts` together, and rebuild/retest. Do not use the randomly generated target/deploy keypair in place of the declared program address.
4. Run `python3 scripts/deploy-devnet.py --deployer <PRIVATE_KEYPAIR_PATH> --program-keypair <PRIVATE_PROGRAM_KEYPAIR_PATH>`. The wrapper verifies the devnet genesis hash and both expected public keys, uses the free public devnet RPC, sets a fixed maximum program length and zero priority price, and leaves global CLI configuration untouched.
5. Query program state at finalized commitment. Resolve ProgramData, read bytes after loader metadata, and compare the deployed SHA-256 to the release executable. Verify the recorded upgrade authority and program executable flag. Record the deployment signature, slot, hash and network in status.md. A submitted upload is not a verified deployment.
6. Test a new fictional devnet coin, an initial buy, later buy/sell, creator claim, graduation and pool swaps. A public $DEPUMP token is not part of this test.

Local developer keys are not shipped in archives or public hosting. Losing the relevant authority key can make an upgrade, fee claim, buffer recovery, or program closure impossible. Backups require a separate private custody handoff; public program source is not a key backup.

## Static public site

The selected public host is `https://curvedev.github.io/decompiled-pump/`, under the explicitly designated project namespace. This URL is a target until publication is verified. Build with `npm run build`, then run `python3 scripts/package-pages.py`. Enable GitHub Pages for the `main` branch `/docs` directory and wait for its deployment to succeed. Public Pages hosting requires no paid subscription for this public repository.

Do not publish a build containing local RPC URLs, secrets, provider-account identifiers, source maps, private account metadata, operator state or an unrelated hosting namespace. The default public build uses Solana devnet, public account data and no embedded API key. A newly registered owner-private Sites project remains unpublished because its default hostname used a different account namespace; its local hosting state is ignored by Git.

Git pushes must authenticate as curvedev and use local Anonymous author/committer metadata. The GitHub connector can read/write files but does not expose custom commit identities, so it cannot replace this requirement. A dedicated isolated CLI session is used for publishing rather than changing an existing personal login/configuration.
