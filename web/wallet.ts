import {getWallets} from '@wallet-standard/app';
import {Connection,Transaction} from '@solana/web3.js';
export const wallets=getWallets();
export let active:any=null,account:any=null;
let unsubscribe:(()=>void)|null=null;
export function compatible(){return wallets.get().filter(w=>w.chains.includes('solana:devnet')&&w.features['standard:connect']&&w.features['solana:signTransaction']);}
export async function connect(wallet:any){
  const result=await wallet.features['standard:connect'].connect();
  const selected=result.accounts.find((a:any)=>a.chains.includes('solana:devnet'));
  if(!selected)throw new Error('This wallet has no compatible devnet account');
  active=wallet;account=selected;
  unsubscribe?.();
  if(wallet.features['standard:events'])unsubscribe=wallet.features['standard:events'].on('change',(change:any)=>{
    if(active!==wallet||!change.accounts)return;
    const previous=account?.address;
    account=change.accounts.find((a:any)=>a.address===previous&&a.chains.includes('solana:devnet'))||null;
    if(!account)active=null;
    window.dispatchEvent(new Event('depump-wallet-change'));
  });
  return selected;
}
export async function disconnect(){unsubscribe?.();unsubscribe=null;if(active?.features['standard:disconnect'])await active.features['standard:disconnect'].disconnect();active=null;account=null;}
export function base58(bytes:Uint8Array){
  const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n=0n;for(const b of bytes)n=n*256n+BigInt(b);let out='';
  while(n){out=alphabet[Number(n%58n)]+out;n/=58n;}
  for(const b of bytes){if(b!==0)break;out='1'+out;}return out;
}
export async function sign(transactions:Transaction[]):Promise<Transaction[]>{
  if(!active||!account)throw new Error('Connect a wallet first');
  const feature=active.features['solana:signTransaction'];
  if(!feature.supportedTransactionVersions.includes('legacy'))throw new Error('Wallet does not support legacy transactions');
  const messages=transactions.map(t=>t.serializeMessage());
  const outputs=await feature.signTransaction(...transactions.map(t=>({account,chain:'solana:devnet',transaction:t.serialize({requireAllSignatures:false,verifySignatures:false})})));
  if(outputs.length!==transactions.length)throw new Error('Wallet did not return every transaction');
  return outputs.map((o:any,i:number)=>{
    const tx=Transaction.from(o.signedTransaction);
    if(!tx.serializeMessage().equals(messages[i])||!tx.verifySignatures())throw new Error('Wallet returned an altered or incomplete transaction');
    return tx;
  });
}
export async function confirmSigned(c:Connection,tx:Transaction,lastValidBlockHeight:number,onSignature:(s:string)=>void){
  const signature=base58(tx.signature!);onSignature(signature);
  const bytes=tx.serialize();
  // Identical signed retries have identical transaction IDs and cannot charge twice.
  let error:unknown;
  for(let attempt=0;attempt<3;attempt++){
    try{
      await c.sendRawTransaction(bytes,{skipPreflight:false,maxRetries:2});
      const result=await c.confirmTransaction({signature,blockhash:tx.recentBlockhash!,lastValidBlockHeight},'confirmed');
      if(result.value.err)throw new Error('Transaction failed: '+JSON.stringify(result.value.err));
      return signature;
    }catch(e){
      error=e;
      const status=(await c.getSignatureStatuses([signature])).value[0];
      if(status?.err)throw new Error('Transaction failed: '+JSON.stringify(status.err));
      if(status?.confirmationStatus==='confirmed'||status?.confirmationStatus==='finalized')return signature;
      if(await c.getBlockHeight('confirmed')>lastValidBlockHeight)break;
    }
  }
  throw new Error('Confirmation is uncertain. Check the transaction status before retrying. '+(error instanceof Error?error.message:''));
}
