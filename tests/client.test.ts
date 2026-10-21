import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Keypair } from '@solana/web3.js';
import { freshCoin,quote,units,tokensForBudget,REAL_TOKEN } from '../web/protocol.ts';
test('decimal input never passes through floating point',()=>{
  assert.equal(units('0.000000001',9),1n);
  assert.equal(units('1000000000.000001',6),1_000_000_000_000_001n);
  for(const s of ['-1','1e3','NaN','0.0000000001','1.2.3'])assert.throws(()=>units(s,9));
});
test('budget inversion respects fee-inclusive maximum',()=>{
  const c=freshCoin(Keypair.generate().publicKey,Keypair.generate().publicKey);
  for(const b of [100n,1000n,1_000_000n,100_000_000n]){
    const n=tokensForBudget(c,b);assert(n>0n);assert(quote(c,n,true).total<=b);
    if(n<REAL_TOKEN)assert(quote(c,n+1n,true).total>b);
  }
});
test('quotes reject dust and empty curves',()=>{
  const c=freshCoin(Keypair.generate().publicKey,Keypair.generate().publicKey);
  assert.throws(()=>quote(c,0n,true));assert.throws(()=>quote(c,1n,false));
  c.realToken=0n;assert.throws(()=>quote(c,1n,true));
});
test('curve preserves the observed exact-division extra lamport',()=>{
  const c=freshCoin(Keypair.generate().publicKey,Keypair.generate().publicKey);
  c.virtualSol=30_000_000_000n;
  assert.equal(quote(c,536_500_000_000_000n,true).gross,30_000_000_001n);
});
