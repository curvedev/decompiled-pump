# Local operator recovery backend

This tool prepares a specific recovery transaction, lets the operator sign it locally, and submits only those exact signed bytes. It never has a public recovery endpoint or sends a private key to a website. Signer keys remain under the operator's control. No recovery is automatic when activity stops.

## What it can recover

| Operation | Required signers | Funds and restrictions |
| --- | --- | --- |
| `wallet` | Selected project role wallet | Unused SOL minus the current base transaction fee; destination defaults to the project recovery wallet |
| `buffer` | Deployer fee payer and actual buffer authority | Only the named DEPUMP deployment buffer, if still present and closeable |
| `platform-fees` | Deployer fee payer and fixed treasury | Only accrued platform fees for the supplied DEPUMP mint; goes to the treasury |
| `retire` | Deployer fee payer and upgrade authority | Eligible ProgramData rent; irreversible protocol retirement. Requires typing `RETIRE <PROGRAM_ID>` and refuses while valid coin accounts exist |

Transaction fees cannot be refunded. Trader deposits, creator fee liabilities, token-holder funds, founding pool liquidity, mint rent and coin-state/metadata rent are not operator refunds. A dead project does not automatically erase holders' rights or make their liquidity withdrawable. If any coin has been launched, this tool refuses program retirement; a separate reviewed retirement plan is needed before considering a program closure that could strand its users. No emergency liquidity drain was added to the protocol.

The recovery recipient is a fresh project wallet whose key is held separately. Moving operator funds to another address is possible only by explicitly supplying that public destination in both preparation and signing/submission. Funding and recovery transactions remain public.

## Prepare, review, sign, submit

Keep all prepared plans, signed transactions, and keypairs in private storage **outside this repository**. Use an explicit new output filename for each attempt; files are never silently overwritten. The examples use placeholders for private paths, not real signer locations.

1. Prepare an unused deployer-wallet sweep. This performs RPC reads only:

   ```sh
   node scripts/operator-recovery.mjs prepare --kind wallet --source-role deployer --out <PRIVATE_PLAN_FILE>
   ```

2. Read the plan and review the operation, recipient, lamports, fee, required signers and message hash. Sign with the selected local role key without sending:

   ```sh
   node scripts/operator-recovery.mjs sign --plan <PRIVATE_PLAN_FILE> --keypair <PRIVATE_DEPLOYER_KEYPAIR> --out <PRIVATE_SIGNED_FILE>
   ```

3. Submit only the reviewed, signed bytes:

   ```sh
   node scripts/operator-recovery.mjs submit --plan <PRIVATE_PLAN_FILE> --out <PRIVATE_SIGNED_FILE> --execute
   ```

For buffer recovery use `prepare --kind buffer`; sign with `--keypair <PRIVATE_DEPLOYER_KEYPAIR> --keypair <PRIVATE_BUFFER_AUTHORITY_KEYPAIR>`. For platform fee claims use `prepare --kind platform-fees --mint <DEPUMP_MINT>` and sign with deployer and treasury keys. For eligible retirement use `prepare --kind retire --retire-ack 'RETIRE <PROGRAM_ID>'` and sign with deployer and upgrade authority keys. The same key should be passed only once when one signer fills both roles.

To choose another wallet recipient add `--recipient <PUBLIC_REFUND_ADDRESS>` to preparation, signing and submission. Platform claims always use the compiled treasury, irrespective of this option. Importing private role keys into a browser extension is not required for this CLI workflow. Private key export/backup and custody handoff must be done privately by the operator; source downloads do not contain those keys.

Plans expire with their Solana blockhash. Re-prepare an expired or stale plan; do not modify its bytes, fee, target, signer or destination. The backend rechecks mainnet genesis, approved deployment scope, actual loader authority, beneficiary wallet ownership, plan hash, expiry and state before signing/submission. Submission performs a simulation. Identical signed bytes have the same transaction ID; check that ID after an uncertain response before creating a new plan. The tool never uses global CLI wallet or network settings.

Seven recovery tests exercise exact wallet sweep fees, signature/message integrity, buffer scope/authority, irreversible-retirement acknowledgement, refusal with launched coins, network/expiry/recipient rejection, and platform-fee-only claims. Eight additional LiteSVM checks execute the native loader and System Program with ephemeral signers: exact buffer refunds, exact ProgramData refunds, refusal to invoke retired code, and a wallet sweep that leaves only its charged fee spent. The small Program account remains after ProgramData closure; its rent is not included in the retirement refund. Run `npm run test:recovery` and, with the mainnet candidate built, `npm run test:recovery:lite`. No mainnet recovery transaction was sent during preparation.
