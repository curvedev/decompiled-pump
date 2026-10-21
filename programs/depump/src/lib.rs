#![allow(unexpected_cfgs, deprecated)]
//! Native independent protocol. CPI targets are only System and legacy SPL Token.
use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo}, entrypoint::ProgramResult,
    program::{invoke, invoke_signed}, program_error::ProgramError, program_pack::Pack,
    pubkey::Pubkey, rent::Rent, system_instruction, system_program, sysvar::Sysvar,
};
use spl_token::{instruction as token_ix, state::{Account as TokenAccount, Mint}};
mod identity;
pub mod math;
pub use identity::{id, ID, TREASURY};
use math::*;
#[cfg(not(feature = "no-entrypoint"))]
solana_program::entrypoint!(process_instruction);

pub const MAGIC: [u8; 8] = *b"DEPUMP01";
pub const STATE_SIZE: usize = 204;
pub const MAX_METADATA: usize = 4096;
const NOT_SEALED: ProgramError = ProgramError::Custom(5);
const WRONG_ACCOUNT: ProgramError = ProgramError::Custom(6);

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug)]
pub struct Coin {
    pub magic: [u8; 8], pub creator: [u8; 32], pub mint: [u8; 32], pub vault: [u8; 32],
    pub phase: u8,
    pub virtual_token: u64, pub virtual_sol: u64, pub real_token: u64, pub real_sol: u64,
    pub creator_fees: u64, pub platform_fees: u64, pub pool_token: u64, pub pool_sol: u64,
    pub metadata_hash: [u8; 32], pub metadata_len: u16, pub sealed: bool,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub enum Instruction {
    Create { metadata_len: u16, metadata_hash: [u8; 32] },
    WriteMetadata { offset: u16, bytes: Vec<u8> },
    Seal,
    Buy { amount: u64, max_sol: u64 },
    Sell { amount: u64, min_sol: u64 },
    Graduate,
    ClaimCreator,
    ClaimPlatform,
}

fn signer(a: &AccountInfo) -> ProgramResult {
    if !a.is_signer { return Err(ProgramError::MissingRequiredSignature); } Ok(())
}
fn writable(a: &AccountInfo) -> ProgramResult {
    if !a.is_writable { return Err(ProgramError::InvalidAccountData); } Ok(())
}
fn key(a: &AccountInfo, expected: &Pubkey) -> ProgramResult {
    if a.key != expected { return Err(WRONG_ACCOUNT); } Ok(())
}
fn owned(a: &AccountInfo, owner: &Pubkey) -> ProgramResult {
    if a.owner != owner { return Err(ProgramError::IllegalOwner); } Ok(())
}
fn load(program: &Pubkey, a: &AccountInfo) -> Result<Coin, ProgramError> {
    owned(a, program)?;
    let coin = Coin::try_from_slice(&a.try_borrow_data()?).map_err(|_| ProgramError::InvalidAccountData)?;
    if coin.magic != MAGIC { return Err(ProgramError::InvalidAccountData); }
    let expected = Pubkey::find_program_address(&[b"coin", &coin.mint], program).0;
    key(a, &expected)?;
    Ok(coin)
}
fn save(a: &AccountInfo, coin: &Coin) -> ProgramResult {
    writable(a)?;
    coin.serialize(&mut &mut a.try_borrow_mut_data()?[..]).map_err(|_| ProgramError::InvalidAccountData)
}
fn transfer_sol<'a>(from: &AccountInfo<'a>, to: &AccountInfo<'a>, system: &AccountInfo<'a>, n: u64) -> ProgramResult {
    key(system, &system_program::id())?;
    invoke(&system_instruction::transfer(from.key, to.key, n), &[from.clone(), to.clone(), system.clone()])
}
fn pay_owned(from: &AccountInfo, to: &AccountInfo, n: u64) -> ProgramResult {
    writable(from)?; writable(to)?;
    if from.key == to.key { return Err(WRONG_ACCOUNT); }
    let remaining = sub(from.lamports(), n)?;
    if remaining < Rent::get()?.minimum_balance(from.data_len()) { return Err(ProgramError::InsufficientFunds); }
    let recipient = add(to.lamports(), n)?;
    **from.try_borrow_mut_lamports()? = remaining;
    **to.try_borrow_mut_lamports()? = recipient;
    Ok(())
}
fn create_account<'a>(payer: &AccountInfo<'a>, new: &AccountInfo<'a>, system: &AccountInfo<'a>, owner: &Pubkey, size: usize, seeds: &[&[u8]]) -> ProgramResult {
    owned(new, &system_program::id())?;
    if !new.data_is_empty() { return Err(ProgramError::AccountAlreadyInitialized); }
    let rent = Rent::get()?.minimum_balance(size);
    if seeds.is_empty() {
        signer(new)?;
        return invoke(&system_instruction::create_account(payer.key,new.key,rent,size as u64,owner), &[payer.clone(),new.clone(),system.clone()]);
    }
    // Allow a PDA to have received unsolicited lamports before initialization.
    let deficit = rent.saturating_sub(new.lamports());
    if deficit > 0 { transfer_sol(payer,new,system,deficit)?; }
    invoke_signed(&system_instruction::allocate(new.key,size as u64), &[new.clone(),system.clone()], &[seeds])?;
    invoke_signed(&system_instruction::assign(new.key,owner), &[new.clone(),system.clone()], &[seeds])
}
fn check_vault(program: &Pubkey, coin: &Coin, vault: &AccountInfo) -> ProgramResult {
    key(vault, &Pubkey::find_program_address(&[b"vault", &coin.mint], program).0)?;
    key(vault, &Pubkey::new_from_array(coin.vault))?;
    owned(vault, &spl_token::id())?;
    let value = TokenAccount::unpack(&vault.try_borrow_data()?)?;
    if value.mint.to_bytes() != coin.mint || value.owner != Pubkey::find_program_address(&[b"coin", &coin.mint],program).0 { return Err(WRONG_ACCOUNT); }
    Ok(())
}
fn check_user_token(coin: &Coin, user: &AccountInfo, token: &AccountInfo) -> ProgramResult {
    owned(token, &spl_token::id())?;
    let value = TokenAccount::unpack(&token.try_borrow_data()?)?;
    if value.mint.to_bytes() != coin.mint || value.owner != *user.key { return Err(WRONG_ACCOUNT); }
    Ok(())
}

pub fn process_instruction(program: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    if program != &ID { return Err(ProgramError::IncorrectProgramId); }
    let ix = Instruction::try_from_slice(data).map_err(|_| ProgramError::InvalidInstructionData)?;
    let iter = &mut accounts.iter();
    match ix {
        Instruction::Create { metadata_len, metadata_hash } => {
            // creator, coin PDA, new mint signer, vault PDA, metadata PDA, System, Token
            let creator=next_account_info(iter)?; let state=next_account_info(iter)?;
            let mint=next_account_info(iter)?; let vault=next_account_info(iter)?;
            let meta=next_account_info(iter)?; let system=next_account_info(iter)?;
            let token=next_account_info(iter)?;
            signer(creator)?; signer(mint)?;
            key(system,&system_program::id())?; key(token,&spl_token::id())?;
            if metadata_len == 0 || metadata_len as usize > MAX_METADATA { return Err(ProgramError::InvalidInstructionData); }
            let (coin_key, cb)=Pubkey::find_program_address(&[b"coin",mint.key.as_ref()],program);
            let (vault_key,vb)=Pubkey::find_program_address(&[b"vault",mint.key.as_ref()],program);
            let (meta_key,mb)=Pubkey::find_program_address(&[b"meta",mint.key.as_ref()],program);
            key(state,&coin_key)?;key(vault,&vault_key)?;key(meta,&meta_key)?;
            create_account(creator,state,system,program,STATE_SIZE,&[b"coin",mint.key.as_ref(),&[cb]])?;
            create_account(creator,mint,system,&spl_token::id(),Mint::LEN,&[])?;
            create_account(creator,vault,system,&spl_token::id(),TokenAccount::LEN,&[b"vault",mint.key.as_ref(),&[vb]])?;
            create_account(creator,meta,system,program,metadata_len as usize,&[b"meta",mint.key.as_ref(),&[mb]])?;
            invoke(&token_ix::initialize_mint2(token.key,mint.key,&coin_key,None,6)?,&[mint.clone(),token.clone()])?;
            invoke(&token_ix::initialize_account3(token.key,vault.key,mint.key,&coin_key)?,&[vault.clone(),mint.clone(),token.clone()])?;
            let seeds:&[&[u8]]=&[b"coin",mint.key.as_ref(),&[cb]];
            invoke_signed(&token_ix::mint_to(token.key,mint.key,vault.key,state.key,&[],SUPPLY)?,&[mint.clone(),vault.clone(),state.clone(),token.clone()],&[seeds])?;
            invoke_signed(&token_ix::set_authority(token.key,mint.key,None,token_ix::AuthorityType::MintTokens,state.key,&[])?,&[mint.clone(),state.clone(),token.clone()],&[seeds])?;
            let coin=Coin{magic:MAGIC,creator:creator.key.to_bytes(),mint:mint.key.to_bytes(),vault:vault.key.to_bytes(),phase:0,
                virtual_token:INITIAL_TOKEN,virtual_sol:INITIAL_SOL,real_token:REAL_TOKEN,real_sol:0,
                creator_fees:0,platform_fees:0,pool_token:0,pool_sol:0,metadata_hash,metadata_len,sealed:false};
            save(state,&coin)
        }
        Instruction::WriteMetadata {offset,bytes} => {
            let creator=next_account_info(iter)?;let state=next_account_info(iter)?;let meta=next_account_info(iter)?;
            signer(creator)?;let coin=load(program,state)?;
            key(creator,&Pubkey::new_from_array(coin.creator))?;
            owned(meta,program)?;key(meta,&Pubkey::find_program_address(&[b"meta",&coin.mint],program).0)?;
            if coin.sealed {return Err(ProgramError::Immutable);}
            let end=(offset as usize).checked_add(bytes.len()).ok_or(ARITHMETIC)?;
            if end > coin.metadata_len as usize {return Err(ProgramError::InvalidInstructionData);}
            meta.try_borrow_mut_data()?[offset as usize..end].copy_from_slice(&bytes);Ok(())
        }
        Instruction::Seal => {
            let creator=next_account_info(iter)?;let state=next_account_info(iter)?;let meta=next_account_info(iter)?;
            signer(creator)?;let mut coin=load(program,state)?;key(creator,&Pubkey::new_from_array(coin.creator))?;
            owned(meta,program)?;key(meta,&Pubkey::find_program_address(&[b"meta",&coin.mint],program).0)?;
            if solana_program::hash::hash(&meta.try_borrow_data()?).to_bytes()!=coin.metadata_hash {return Err(ProgramError::InvalidAccountData);}
            coin.sealed=true;save(state,&coin)
        }
        Instruction::Buy {amount,max_sol} | Instruction::Sell {amount,min_sol:max_sol} => {
            // user, coin, vault, user token, Token, System
            let user=next_account_info(iter)?;let state=next_account_info(iter)?;let vault=next_account_info(iter)?;
            let user_token=next_account_info(iter)?;let token=next_account_info(iter)?;let system=next_account_info(iter)?;
            signer(user)?;key(token,&spl_token::id())?;key(system,&system_program::id())?;
            let mut coin=load(program,state)?;if !coin.sealed {return Err(NOT_SEALED);}
            check_vault(program,&coin,vault)?;check_user_token(&coin,user,user_token)?;
            let graduated=coin.phase==1;
            if coin.phase>1 || (!graduated && coin.real_token==0) {return Err(WRONG_PHASE);}
            let (base,quote)=if graduated {(coin.pool_token,coin.pool_sol)} else {(coin.virtual_token,coin.virtual_sol)};
            let buying=matches!(ix,Instruction::Buy{..});
            let gross=if buying {if graduated {buy_cost(base,quote,amount)?} else {curve_buy_cost(base,quote,amount)?}} else {sell_gross(base,quote,amount)?};
            if gross==0 {return Err(INVALID_AMOUNT);}
            let (platform_fee,creator_fee,lp_fee)=fees(gross,graduated)?;
            let charges=add(add(platform_fee,creator_fee)?,lp_fee)?;
            coin.platform_fees=add(coin.platform_fees,platform_fee)?;
            coin.creator_fees=add(coin.creator_fees,creator_fee)?;
            if buying {
                if !graduated && amount>coin.real_token {return Err(INVALID_AMOUNT);}
                let total=add(gross,charges)?;if total>max_sol {return Err(SLIPPAGE);}
                transfer_sol(user,state,system,total)?;
                let bump=Pubkey::find_program_address(&[b"coin",&coin.mint],program).1;
                invoke_signed(&token_ix::transfer(token.key,vault.key,user_token.key,state.key,&[],amount)?,&[vault.clone(),user_token.clone(),state.clone(),token.clone()],&[&[b"coin",&coin.mint,&[bump]]])?;
                if graduated {coin.pool_token=sub(base,amount)?;coin.pool_sol=add(quote,add(gross,lp_fee)?)?;}
                else {coin.virtual_token=sub(base,amount)?;coin.virtual_sol=add(quote,gross)?;coin.real_token=sub(coin.real_token,amount)?;coin.real_sol=add(coin.real_sol,gross)?;}
            } else {
                let net=sub(gross,charges)?;if net==0 {return Err(INVALID_AMOUNT);}
                if net<max_sol {return Err(SLIPPAGE);}
                if !graduated && gross>coin.real_sol {return Err(ProgramError::InsufficientFunds);}
                invoke(&token_ix::transfer(token.key,user_token.key,vault.key,user.key,&[],amount)?,&[user_token.clone(),vault.clone(),user.clone(),token.clone()])?;
                pay_owned(state,user,net)?;
                if graduated {coin.pool_token=add(base,amount)?;coin.pool_sol=sub(quote,sub(gross,lp_fee)?)?;}
                else {coin.virtual_token=add(base,amount)?;coin.virtual_sol=sub(quote,gross)?;coin.real_token=add(coin.real_token,amount)?;coin.real_sol=sub(coin.real_sol,gross)?;}
            }
            save(state,&coin)?;
            solana_program::msg!("DEPUMP_TRADE {} {} {} {} {} {}",if buying {"buy"} else {"sell"},amount,gross,platform_fee,creator_fee,lp_fee);
            Ok(())
        }
        Instruction::Graduate => {
            let state=next_account_info(iter)?;let vault=next_account_info(iter)?;
            let mut coin=load(program,state)?;check_vault(program,&coin,vault)?;
            if coin.phase==1 {return Ok(());}
            if !coin.sealed || coin.real_token!=0 || coin.real_sol==0 {return Err(WRONG_PHASE);}
            // The same PDA retains custody. Virtual reserves end; real reserves price the pool.
            // No LP mint or withdrawal instruction exists: founding liquidity is permanently locked.
            coin.pool_token=SUPPLY-REAL_TOKEN;coin.pool_sol=coin.real_sol;
            coin.real_sol=0;coin.phase=1;save(state,&coin)?;
            solana_program::msg!("DEPUMP_GRADUATED {} {}",coin.pool_token,coin.pool_sol);Ok(())
        }
        Instruction::ClaimCreator | Instruction::ClaimPlatform => {
            let recipient=next_account_info(iter)?;let state=next_account_info(iter)?;
            signer(recipient)?;let mut coin=load(program,state)?;
            let creator=matches!(ix,Instruction::ClaimCreator);
            key(recipient,&if creator {Pubkey::new_from_array(coin.creator)} else {TREASURY})?;
            let amount=if creator {coin.creator_fees} else {coin.platform_fees};
            if amount==0 {return Err(INVALID_AMOUNT);}
            if creator {coin.creator_fees=0;} else {coin.platform_fees=0;}
            pay_owned(state,recipient,amount)?;save(state,&coin)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn state_layout_is_fixed() {
        let coin=Coin{magic:MAGIC,creator:[0;32],mint:[0;32],vault:[0;32],phase:0,virtual_token:0,virtual_sol:0,real_token:0,real_sol:0,creator_fees:0,platform_fees:0,pool_token:0,pool_sol:0,metadata_hash:[0;32],metadata_len:1,sealed:false};
        assert_eq!(borsh::to_vec(&coin).unwrap().len(),STATE_SIZE);
    }
}
