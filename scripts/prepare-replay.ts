// Build controlled genesis accounts around genuine captured global configuration.
// Synthetic fixtures are explicitly not historic transaction pre-state.
import {BorshAccountsCoder,BN} from '@coral-xyz/anchor';
import {PublicKey,Keypair,SystemProgram} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID,NATIVE_MINT,MintLayout,AccountLayout,getAssociatedTokenAddressSync} from '@solana/spl-token';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const out=resolve(process.env.REPLAY_DIR||'../work/replay');mkdirSync(out,{recursive:true});
const idl=JSON.parse(readFileSync('research/raw/pump.json','utf8'));
const snapshot=JSON.parse(readFileSync('research/raw/config-snapshot.json','utf8'));
const coder=new BorshAccountsCoder(idl),pump=new PublicKey(idl.address);
const global=coder.decode('Global',Buffer.from(snapshot.value[0].data[0],'base64'));
const trader=Keypair.generate(),creator=Keypair.generate().publicKey;
writeFileSync(out+'/trader-keypair.json',JSON.stringify([...trader.secretKey]),{mode:0o600});
const accounts:string[]=[];
function fixture(name:string,key:PublicKey,account:any){const path=out+'/'+name+'.json';writeFileSync(path,JSON.stringify({pubkey:key.toBase58(),account:{...account,rentEpoch:0}}));accounts.push('--account',key.toBase58(),path);}
function synthetic(name:string,key:PublicKey,owner:PublicKey,data:Buffer,lamports=10_000_000){fixture(name,key,{lamports,data:[data.toString('base64'),'base64'],owner:owner.toBase58(),executable:false,rentEpoch:0,space:data.length});}
for(let i=0;i<snapshot.addresses.length;i++)fixture('config-'+i,new PublicKey(snapshot.addresses[i]),snapshot.value[i]);
synthetic('trader',trader.publicKey,SystemProgram.programId,Buffer.alloc(0),1_000_000_000_000);
synthetic('buyback',global.buyback_fee_recipients[0],SystemProgram.programId,Buffer.alloc(0),10_000_000);
const cases=[];
for(const [i,amount]of[1n,1_000_000n,100_000_000_000_000n,536_500_000_000_000n].entries()){
 const mint=Keypair.generate().publicKey;
 const curve=PublicKey.findProgramAddressSync([Buffer.from('bonding-curve'),mint.toBuffer()],pump)[0];
 const vault=getAssociatedTokenAddressSync(mint,curve,true),ata=getAssociatedTokenAddressSync(mint,trader.publicKey);
 const mintData=Buffer.alloc(MintLayout.span);
 MintLayout.encode({mintAuthorityOption:0,mintAuthority:PublicKey.default,supply:BigInt(global.token_total_supply.toString()),decimals:6,isInitialized:true,freezeAuthorityOption:0,freezeAuthority:PublicKey.default},mintData);
 synthetic('mint-'+i,mint,TOKEN_PROGRAM_ID,mintData);
 for(const [label,key,owner,quantity]of[['vault',vault,curve,BigInt(global.token_total_supply.toString())],['ata',ata,trader.publicKey,0n]]as const){
  const data=Buffer.alloc(AccountLayout.span);
  AccountLayout.encode({mint,owner,amount:quantity,delegateOption:0,delegate:PublicKey.default,state:1,isNativeOption:0,isNative:0n,delegatedAmount:0n,closeAuthorityOption:0,closeAuthority:PublicKey.default},data);
  synthetic(label+'-'+i,key,TOKEN_PROGRAM_ID,data);
 }
 const values:any={virtual_token_reserves:global.initial_virtual_token_reserves,virtual_quote_reserves:global.initial_virtual_sol_reserves,real_token_reserves:global.initial_real_token_reserves,real_quote_reserves:new BN(0),token_total_supply:global.token_total_supply,complete:false,creator,is_mayhem_mode:false,is_cashback_coin:false,quote_mint:PublicKey.default,creator_fee_bps:new BN(0),can_edit_creator_fee:false,is_holder_reward:false,creator_fee:new BN(0),protocol_fees:new BN(0),depth:0,initial_virtual_quote_reserves:global.initial_virtual_sol_reserves,post_complete_base_out:new BN(0),post_complete_quote_in:new BN(0)};
 const encoded=await coder.encode('BondingCurve',values);const padded=Buffer.alloc(256);encoded.copy(padded);
 synthetic('curve-'+i,curve,pump,padded);
 cases.push({mint:mint.toBase58(),curve:curve.toBase58(),vault:vault.toBase58(),ata:ata.toBase58(),amount:amount.toString()});
}
writeFileSync(out+'/fixtures.json',JSON.stringify({pump:pump.toBase58(),trader:trader.publicKey.toBase58(),global:snapshot.addresses[0],feeConfig:snapshot.addresses[1],buyback:global.buyback_fee_recipients[0].toBase58(),cases,contextSlot:snapshot.context.slot},null,2));
writeFileSync(out+'/validator-accounts.json',JSON.stringify(accounts));
console.log('Prepared four synthetic curves using captured configuration; runtime key remains outside the repository.');
