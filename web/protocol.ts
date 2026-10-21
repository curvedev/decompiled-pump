import { Buffer } from 'buffer';
import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
export const PROGRAM = new PublicKey('8pCWBPUbkivA94J2dLC4rzJmx7kHGrV3qD378DkhAM71');
export const TREASURY = new PublicKey('GAjNZJrEC48Dc7Y1N8foJnbrknRbVTuGJXpdL13npmrb');
export const RPC = import.meta.env?.VITE_RPC_URL || 'https://api.devnet.solana.com';
export const SUPPLY = 1_000_000_000_000_000n;
export const REAL_TOKEN = 793_100_000_000_000n;
export const INITIAL_TOKEN = 1_073_000_000_000_000n;
export const INITIAL_SOL = 30_000_000n;
export type Coin = {
  address: PublicKey; creator: PublicKey; mint: PublicKey; vault: PublicKey; phase: number;
  virtualToken: bigint; virtualSol: bigint; realToken: bigint; realSol: bigint;
  creatorFees: bigint; platformFees: bigint; poolToken: bigint; poolSol: bigint;
  metadataHash: Uint8Array; metadataLen: number; sealed: boolean;
};
export type Metadata = { name: string; ticker: string; description: string; image: string; website?: string; x?: string; telegram?: string };
export const encoder = new TextEncoder();
export function pda(seed: string, mint: PublicKey) {
  return PublicKey.findProgramAddressSync([encoder.encode(seed), mint.toBytes()], PROGRAM)[0];
}
export function decodeCoin(address: PublicKey, data: Uint8Array): Coin {
  const b = Buffer.from(data);
  if (b.length !== 204 || b.subarray(0, 8).toString() !== 'DEPUMP01') throw new Error('Invalid coin account');
  const read = (offset: number) => b.readBigUInt64LE(offset);
  const mint = new PublicKey(b.subarray(40,72));
  if (!address.equals(pda('coin', mint))) throw new Error('Invalid coin address');
  return { address, creator: new PublicKey(b.subarray(8,40)), mint,
    vault: new PublicKey(b.subarray(72,104)), phase:b[104],
    virtualToken:read(105),virtualSol:read(113),realToken:read(121),realSol:read(129),
    creatorFees:read(137),platformFees:read(145),poolToken:read(153),poolSol:read(161),
    metadataHash:b.subarray(169,201),metadataLen:b.readUInt16LE(201),sealed:!!b[203] };
}
export function u64(n: bigint) {
  if (n < 0n || n > 18_446_744_073_709_551_615n) throw new Error('Amount out of range');
  const bytes = Buffer.alloc(8); bytes.writeBigUInt64LE(n); return bytes;
}
export function units(value: string, decimals: number) {
  if (!new RegExp(`^\\d+(?:\\.\\d{0,${decimals}})?$`).test(value)) throw new Error(`Use a positive amount with up to ${decimals} decimals`);
  const [whole, fraction=''] = value.split('.');
  const result=BigInt(whole)*10n**BigInt(decimals)+BigInt(fraction.padEnd(decimals,'0'));
  u64(result); return result;
}
export function ceil(n: bigint, d: bigint) { if (d<=0n) throw new Error('Invalid reserves'); return (n+d-1n)/d; }
export function quote(coin: Coin, amount: bigint, buying: boolean) {
  if (amount<=0n) throw new Error('Enter an amount above zero');
  if (!coin.sealed || (coin.phase===0 && coin.realToken===0n)) throw new Error('Coin is awaiting graduation or metadata');
  const base=coin.phase===1?coin.poolToken:coin.virtualToken;
  const sol=coin.phase===1?coin.poolSol:coin.virtualSol;
  if (buying && (amount>=base || (coin.phase===0 && amount>coin.realToken))) throw new Error('Amount exceeds available liquidity');
  const gross=buying?(coin.phase===1?ceil(sol*amount,base-amount):sol*amount/(base-amount)+1n):sol*amount/(base+amount);
  const platform=ceil(gross*75n,10_000n), creator=ceil(gross*25n,10_000n), lp=coin.phase===1?ceil(gross*30n,10_000n):0n;
  const total=buying?gross+platform+creator+lp:gross-platform-creator-lp;
  if (gross<=0n || total<=0n) throw new Error('Amount is too small after rounding');
  if (!buying && coin.phase===0 && gross>coin.realSol) throw new Error('Insufficient real SOL reserves');
  u64(total); return {gross,platform,creator,lp,total};
}
export function tokensForBudget(coin: Coin, budget: bigint) {
  let lo=0n, hi=coin.phase===0?coin.realToken:coin.poolToken-1n;
  while(lo<hi) { const mid=(lo+hi+1n)/2n;
    try {if(quote(coin,mid,true).total<=budget)lo=mid;else hi=mid-1n;} catch {hi=mid-1n;}
  } return lo;
}
const meta = (pubkey: PublicKey, isWritable=false, isSigner=false) => ({pubkey,isWritable,isSigner});
export function createInstruction(user: PublicKey, mint: PublicKey, bytes: Uint8Array, hash: Uint8Array) {
  if (bytes.length<1||bytes.length>4096||hash.length!==32) throw new Error('Metadata must fit 4096 bytes');
  const len=Buffer.alloc(2);len.writeUInt16LE(bytes.length);
  return new TransactionInstruction({programId:PROGRAM,data:Buffer.concat([Buffer.from([0]),len,hash]),keys:[
    meta(user,true,true),meta(pda('coin',mint),true),meta(mint,true,true),meta(pda('vault',mint),true),
    meta(pda('meta',mint),true),meta(SystemProgram.programId),meta(TOKEN_PROGRAM_ID)]});
}
export function writeInstruction(user:PublicKey,mint:PublicKey,offset:number,bytes:Uint8Array) {
  const header=Buffer.alloc(7);header[0]=1;header.writeUInt16LE(offset,1);header.writeUInt32LE(bytes.length,3);
  return new TransactionInstruction({programId:PROGRAM,data:Buffer.concat([header,bytes]),keys:[meta(user,false,true),meta(pda('coin',mint)),meta(pda('meta',mint),true)]});
}
export function sealInstruction(user:PublicKey,mint:PublicKey) {
  return new TransactionInstruction({programId:PROGRAM,data:Buffer.from([2]),keys:[meta(user,false,true),meta(pda('coin',mint),true),meta(pda('meta',mint))]});
}
export function tradeInstruction(user:PublicKey,coin:Coin,amount:bigint,limit:bigint,buying:boolean) {
  return new TransactionInstruction({programId:PROGRAM,data:Buffer.concat([Buffer.from([buying?3:4]),u64(amount),u64(limit)]),keys:[
    meta(user,true,true),meta(coin.address,true),meta(coin.vault,true),meta(getAssociatedTokenAddressSync(coin.mint,user),true),meta(TOKEN_PROGRAM_ID),meta(SystemProgram.programId)]});
}
export function graduateInstruction(coin:Coin) {return new TransactionInstruction({programId:PROGRAM,data:Buffer.from([5]),keys:[meta(coin.address,true),meta(coin.vault)]});}
export function claimInstruction(user:PublicKey,coin:Coin,creator=true) {return new TransactionInstruction({programId:PROGRAM,data:Buffer.from([creator?6:7]),keys:[meta(user,true,true),meta(coin.address,true)]});}
export function freshCoin(mint:PublicKey,user:PublicKey):Coin {
  return {address:pda('coin',mint),creator:user,mint,vault:pda('vault',mint),phase:0,virtualToken:INITIAL_TOKEN,virtualSol:INITIAL_SOL,realToken:REAL_TOKEN,realSol:0n,creatorFees:0n,platformFees:0n,poolToken:0n,poolSol:0n,metadataHash:new Uint8Array(32),metadataLen:0,sealed:true};
}
