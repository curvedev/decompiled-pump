#[cfg(not(feature = "mainnet"))]
solana_program::declare_id!("8pCWBPUbkivA94J2dLC4rzJmx7kHGrV3qD378DkhAM71");
#[cfg(feature = "mainnet")]
solana_program::declare_id!("4SBqwENU4drhkJY32ZjpZTtXvhRydVffaxfA3CPR4qgH");
#[cfg(not(feature = "mainnet"))]
pub const TREASURY: solana_program::pubkey::Pubkey = solana_program::pubkey!("GAjNZJrEC48Dc7Y1N8foJnbrknRbVTuGJXpdL13npmrb");
#[cfg(feature = "mainnet")]
pub const TREASURY: solana_program::pubkey::Pubkey = solana_program::pubkey!("Gj5G8VAQ35gNyDhB3t39frQ95oeR3UjFsgn2rbpct5uU");
