import {PublicKey,type Connection,type ParsedTransactionWithMeta} from '@solana/web3.js';
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function instructionBytes(value:string){
 if(value.length>60)throw new Error('Unexpected instruction size');
 let n=0n;for(const c of value){const digit=alphabet.indexOf(c);if(digit<0)throw new Error('Invalid instruction');n=n*58n+BigInt(digit);}
 const bytes:number[]=[];while(n){bytes.unshift(Number(n&255n));n>>=8n;}for(const c of value){if(c!=='1')break;bytes.unshift(0);}return Uint8Array.from(bytes);
}
export function createdMints(tx:ParsedTransactionWithMeta|null,program:PublicKey):string[]{
 if(!tx?.meta||tx.meta.err)return[];
 const instructions=[...tx.transaction.message.instructions,...(tx.meta.innerInstructions||[]).flatMap(group=>group.instructions)],mints=new Set<string>();
 for(const ix of instructions){
  if(!ix.programId.equals(program)||!('data'in ix)||!('accounts'in ix)||ix.accounts.length<7)continue;
  try{
   const data=instructionBytes(ix.data);if(data.length!==35||data[0]!==0)continue;
   const len=data[1]+data[2]*256;if(len<1||len>4096)continue;
   const mint=ix.accounts[2],expected=PublicKey.findProgramAddressSync([new TextEncoder().encode('coin'),mint.toBytes()],program)[0];
   if(ix.accounts[1].equals(expected))mints.add(mint.toBase58());
  }catch{/* Other instructions never establish a launch. */}
 }
 return[...mints];
}
type DiscoveryRPC=Pick<Connection,'getSignaturesForAddress'|'getParsedTransactions'>;
export class LaunchDiscovery{
 readonly mints=new Set<string>();
 private seen=new Set<string>();
 private before:string|undefined;
 hasOlder=false;
 constructor(private program:PublicKey){}
 async scan(connection:DiscoveryRPC,older=false){
  if(older&&!this.hasOlder)return;
  let cursor=older?this.before:undefined;
  let tail:Awaited<ReturnType<DiscoveryRPC['getSignaturesForAddress']>>=[];
  const found=new Set<string>(),observed=new Set<string>();
  do{
   const signatures=await connection.getSignaturesForAddress(this.program,{limit:20,...(cursor?{before:cursor}:{})},'confirmed');
   const overlap=signatures.some(s=>this.seen.has(s.signature));
   const unread=signatures.filter(s=>!s.err&&!this.seen.has(s.signature));
   for(let i=0;i<unread.length;i++){
    const transactions=await connection.getParsedTransactions([unread[i].signature],{commitment:'confirmed',maxSupportedTransactionVersion:0});
    if(transactions.length!==1||!transactions[0]?.meta)throw new Error('Launch history is incomplete. Refresh to retry.');
    for(const mint of createdMints(transactions[0],this.program))found.add(mint);
    if(i+1<unread.length)await new Promise(resolve=>setTimeout(resolve,200));
   }
   for(const entry of signatures)observed.add(entry.signature);
   tail=signatures;cursor=signatures.at(-1)?.signature;
   // Refresh through any new pages until the previously observed head is reached.
   if(older||!this.seen.size||overlap||signatures.length<20)break;
  }while(cursor);
  // Commit only after every requested transaction is available. Refresh preserves the older cursor.
  if(older||!this.seen.size){this.before=tail.at(-1)?.signature;this.hasOlder=tail.length===20;}
  for(const mint of found)this.mints.add(mint);
  for(const signature of observed)this.seen.add(signature);
 }
}
