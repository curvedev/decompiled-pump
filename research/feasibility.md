# Bounded feasibility investigation — 21 October 2026

## What was actually done

Official program addresses were established from Pump's own IDLs/documentation at commit `639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22`. Finalized read-only mainnet RPC calls retrieved each upgradeable Program account, resolved its ProgramData address, and re-read both in one getMultipleAccounts response. ProgramData deployment slot, upgrade authority, executable byte length and SHA-256 were recorded in [binary-manifest.json](binary-manifest.json). The three captures have different context slots; they are not one atomic cross-program deployment snapshot.

The executable hash covers every byte after the 45-byte loader metadata, including allocated trailing padding. Pump and PumpSwap each have roughly 10 MB allocated while their ELF sections occupy less space. Deployment slots are the loader's last-deployment slot, not proof of the first deployment or upgrade history. The sample was captured at finalized commitment; no original Rust source or debug information was recovered.

Anza's sBPF CLI 0.25.0, at the exact commit in [dispatch-map.json](dispatch-map.json), successfully loaded, verified and disassembled the captured Pump executable into 233,607 text lines. Fifty-six immediate constants match the pinned IDL's instruction discriminators. [binary-static.json](binary-static.json) records ELF sections and narrow instruction/error label observations with file offsets. Labels and strings are evidence of bytes; they do not establish branch reachability, authority enforcement, fee math, or complete semantics on their own.

REA was explicitly waived by the project requester after initial tool discovery. No REA provider was connected or run, and no REA contribution is claimed. Compatible Anza sBPF tools and LiteSVM were used directly.

## Original executable execution

Agave 4.3.2 test-validator successfully ran our independent program. A second validator containing the original program remained at slot zero during the bounded attempt, so it produced no valid original comparison. We stopped that attempt and used the official npm LiteSVM 0.8.0 ARM64 runtime instead.

LiteSVM loaded the captured original Pump executable and fee program; standard token/system programs and native mint accounts were enabled. The real captured Global and FeeConfig account data were combined with **synthetic** legacy SPL mints, vaults, trader balances and curve accounts. Account rentEpoch metadata was normalized to zero for local fixtures; account data remained as captured for Global/FeeConfig. The fixture keys are generated outside shared source. This is a controlled local executable test, not a historic transaction replay or a reproduction of the exact mainnet bank feature set.

[original-test-results.json](original-test-results.json) records four buys, four subsequent sells, four failed buys with a zero slippage limit, fee changes, and unchanged curve reserves after failures. The generated instruction is `buy_v3` / `sell_v3`, not an SDK call into a mocked program.

Observed buy quote amounts match `floor(Y*A/(X-A))+1`. The exact-divisibility sample A=536,500,000,000,000, X=1,073,000,000,000,000, Y=30,000,000,000 cost **30,000,000,001** lamports, while a ceiling-only candidate gives 30,000,000,000. All four sell gross amounts match floor division. The one-base-unit sell succeeded with zero gross output; our independent protocol deliberately rejects zero-net dust trades.

The captured fee schedule produced a creator fee and a protocol fee split between retained fees and a buyback recipient. The recorded non-dust samples are consistent with 30 bps creator and 95 bps protocol at that tested tier, independent upward rounding and a buyback split. This is an inference from those finite samples, not a universal fee schedule or a validation of all fee tiers. Our fixed 75/25 bps fee choice is an explicit difference.

## Evidence classes and limits

The [ledger](evidence-ledger.json) distinguishes binary observations, captured account state, documentation claims, local original-program execution, reconstruction, and independent tests. Coin creation, metadata, initial parameters, fee recipient/claim interfaces, administrative controls and migration are described by official documentation and/or present as instruction constants, but were not all executed against the original program.

Not recovered/tested here: original source; source-level decompilation; a byte-identical rebuild; full data/control-flow reconstruction of every handler; original creation, claims, administration, graduation/PumpSwap and synthetic migration; non-SOL quote assets; reward, cashback, or mayhem modes; historic transaction/account replay; complete equivalence. PumpSwap/Fee captures and static labels must not be presented as full runtime analysis of those programs.

Independent protocol tests establish behavior only for our finite cases. The implementation is consciously simpler: SOL-only legacy-token coins, fixed fees, smaller devnet SOL reserve, immutable hash-committed on-chain thumbnails, explicit graduation into a pool phase under our program, and no LP withdrawal path. Graduation and pool execution are implemented and locally tested, not placeholders. Production governance, deeper adversarial review, extension-wallet validation, devnet deployment, and public hosting each retain separate readiness conditions.

## Reproducibility

Use the setup commands in README. Pin the binary hashes before interpretation. Preserve raw captures locally; the public RPC ordinarily cannot retrieve an old ProgramData version after an upgrade. Re-running captures is a new observation and must not overwrite the established research pin. Raw third-party bytes and copied IDLs are excluded from public artifacts; the public ledger links their authoritative source and records hashes instead.
