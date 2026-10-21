export const CLUSTER=(import.meta.env?.DEPUMP_NETWORK ?? (typeof process!=='undefined'?process.env.DEPUMP_NETWORK:undefined) ?? 'devnet');
if(CLUSTER!=='devnet'&&CLUSTER!=='mainnet')throw new Error('Unsupported DEPUMP network');
export const MAINNET=CLUSTER==='mainnet';
export const CONFIG=MAINNET?{program:'4SBqwENU4drhkJY32ZjpZTtXvhRydVffaxfA3CPR4qgH',treasury:'Gj5G8VAQ35gNyDhB3t39frQ95oeR3UjFsgn2rbpct5uU',genesis:'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',rpc:'https://api.mainnet-beta.solana.com',chain:'solana:mainnet' as const,initialSol:30_000_000_000n}:{program:'8pCWBPUbkivA94J2dLC4rzJmx7kHGrV3qD378DkhAM71',treasury:'GAjNZJrEC48Dc7Y1N8foJnbrknRbVTuGJXpdL13npmrb',genesis:'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',rpc:'https://api.devnet.solana.com',chain:'solana:devnet' as const,initialSol:30_000_000n};
export const networkLabel=MAINNET?'Solana mainnet':'Solana devnet';
export const fundsLabel=MAINNET?'real SOL':'test SOL only';
export const storageKey=(name:string)=>`depump.${CLUSTER}.${CONFIG.program}.${name}`;
export const explorerTx=(signature:string)=>`https://explorer.solana.com/tx/${signature}${MAINNET?'':'?cluster=devnet'}`;
