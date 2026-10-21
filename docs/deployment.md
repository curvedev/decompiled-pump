# Deployment and wallet roles

The public release at **https://depump.fun/** uses the verified **mainnet** program `4SBqwENU4drhkJY32ZjpZTtXvhRydVffaxfA3CPR4qgH`. Finalized executable bytes match the exact locally tested artifact. Separate deployer, upgrade authority, treasury and recovery roles are listed in [mainnet.md](mainnet.md). No project token or mainnet verification coin was launched.

## Mainnet release

Build the program with `python3 scripts/build-program.py --network mainnet`. Build the frontend with `DEPUMP_NETWORK=mainnet npm run build`. `python3 scripts/package-pages.py` performs finalized exact-byte verification before copying a mainnet frontend into Pages. Development builds continue to default to devnet.

The initial upload stopped at its retry limit. After inspecting actual buffer authority, data and remaining budget, `scripts/resume-mainnet-upload.mjs` completed only mismatched 900-byte chunks with bounded sequential submissions, zero priority fees, explicit mainnet genesis and the same private approval. Signed artifacts remained outside the repository. Eight local native-loader checks verify its write encoding, exact range, authorization failure and rollback. `python3 scripts/mainnet-control.py finalize` accepts only the byte-complete named buffer and the already approved roles/budget; it refuses an existing program. Final verification is in `research/mainnet-deployment.json`, and actual balance/rent accounting is in `research/mainnet-costs.json`.

The following devnet procedure documents the earlier verification environment.

## Devnet project identities

| Role | Devnet public address | Control |
| --- | --- | --- |
| Independent program | `8pCWBPUbkivA94J2dLC4rzJmx7kHGrV3qD378DkhAM71` | Program-address signer used only during deployment |
| Deployer / upgrade authority / platform treasury | `GAjNZJrEC48Dc7Y1N8foJnbrknRbVTuGJXpdL13npmrb` | Separate local project key, excluded from source and deliverables |
| Coin creator | User's selected wallet | Receives only that coin's accrued creator fees |
| Trading wallet | User's selected wallet | Approves buys/sells and controls received tokens |

The combined devnet operator roles are a routine test choice, not an approved mainnet wallet design. Mainnet requires separately named fee payer, upgrade/governance authority, treasury recipient and recovery recipient. Program IDs, genesis checks and treasury constants must be reviewed together before any new network.

## Devnet build, fund, deploy

1. Build with `python3 scripts/build-program.py`. This passes anonymous home-directory remap flags and rejects a resulting executable containing a builder home path.
2. Obtain free test SOL from [Solana's official faucet](https://faucet.solana.com). Around 2 test SOL gives upload headroom for this artifact. Never send mainnet SOL to satisfy a devnet funding request.
3. Inspect the finalized artifact, rent estimate and public role keys. Private project keypairs stay outside source. For a fresh fork, generate new keys outside the repository, change `identity.rs` and `web/protocol.ts` together, and rebuild/retest. Do not use the randomly generated target/deploy keypair in place of the declared program address.
4. Run `python3 scripts/deploy-devnet.py --deployer <PRIVATE_KEYPAIR_PATH> --program-keypair <PRIVATE_PROGRAM_KEYPAIR_PATH>`. The wrapper verifies the devnet genesis hash and both expected public keys, uses the free public devnet RPC, sets a fixed maximum program length and zero priority price, and leaves global CLI configuration untouched. A named private buffer keypair is kept beside the program keypair (or supplied with `--buffer`); recovery phrases are suppressed and failure diagnostics stay beside that private buffer, outside public source.
5. Run `python3 scripts/verify-devnet.py`. It queries finalized loader state, checks the exact full executable bytes and dedicated authority, and writes `research/devnet-deployment.json`. Record the deploy signature separately. A submitted upload is not a verified deployment.
6. Run `node --import tsx scripts/smoke-devnet.ts <PRIVATE_DEPLOYER_KEYPAIR_PATH>` for a fictional TEST coin lifecycle, including curve buys/sells, creator/platform claims, graduation and pool swaps. It uses a checkpoint beside that private keypair and bounded public-RPC retries. Re-running resumes the same coin. Results and finalized signatures are written to `research/devnet-smoke-results.json`. The smoke test checks a 0.2 test-SOL budget; it never requests funds or accepts a mainnet URL. A public $DEPUMP token is not part of this test.

Local developer keys are not shipped in archives or public hosting. Losing the relevant authority key can make an upgrade, fee claim, buffer recovery, or program closure impossible. Backups require a separate private custody handoff; public program source is not a key backup.

## Static public site

The public host is `https://depump.fun/`, served by GitHub Pages under the explicitly designated curvedev namespace with HTTPS enforced. Publication was verified on 21 October 2026, including a successful Pages build, exact public HTML and live browser reads. For mainnet, build with `DEPUMP_NETWORK=mainnet npm run build`, then run `python3 scripts/package-pages.py`; this invokes finalized deployment verification. Enable GitHub Pages for the `main` branch `/docs` directory and wait for its deployment to succeed. Public Pages hosting requires no paid subscription for this public repository.

Do not publish a build containing local RPC URLs, secrets, provider-account identifiers, source maps, private account metadata, operator state or an unrelated hosting namespace. Development builds default to devnet; the published build explicitly selects mainnet, public account data and no embedded API key. A newly registered owner-private Sites project remains unpublished because its default hostname used a different account namespace; its local hosting state is ignored by Git.

Git pushes must authenticate as curvedev and use local Anonymous author/committer metadata. The GitHub connector can read/write files but does not expose custom commit identities, so it cannot replace this requirement. A dedicated isolated CLI session is used for publishing rather than changing an existing personal login/configuration.
