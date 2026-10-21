//! Independently implemented arithmetic; not recovered Pump source.
use solana_program::program_error::ProgramError;
pub const SUPPLY: u64 = 1_000_000_000_000_000;
pub const INITIAL_TOKEN: u64 = 1_073_000_000_000_000;
pub const REAL_TOKEN: u64 = 793_100_000_000_000;
// Deliberate devnet difference: 1/1000 of the documented historical SOL reserve.
#[cfg(not(feature = "mainnet"))]
pub const INITIAL_SOL: u64 = 30_000_000;
#[cfg(feature = "mainnet")]
pub const INITIAL_SOL: u64 = 30_000_000_000;
pub const PLATFORM_BPS: u64 = 75;
pub const CREATOR_BPS: u64 = 25;
pub const LP_BPS: u64 = 30;
pub const ARITHMETIC: ProgramError = ProgramError::Custom(1);
pub const INVALID_AMOUNT: ProgramError = ProgramError::Custom(2);
pub const SLIPPAGE: ProgramError = ProgramError::Custom(3);
pub const WRONG_PHASE: ProgramError = ProgramError::Custom(4);

pub fn add(a: u64, b: u64) -> Result<u64, ProgramError> {
    a.checked_add(b).ok_or(ARITHMETIC)
}
pub fn sub(a: u64, b: u64) -> Result<u64, ProgramError> {
    a.checked_sub(b).ok_or(ARITHMETIC)
}
pub fn ceil_mul_div(a: u64, b: u64, d: u64) -> Result<u64, ProgramError> {
    if d == 0 { return Err(ARITHMETIC); }
    let n = (a as u128) * (b as u128);
    u64::try_from(n.div_ceil(d as u128)).map_err(|_| ARITHMETIC)
}
pub fn floor_mul_div(a: u64, b: u64, d: u64) -> Result<u64, ProgramError> {
    if d == 0 { return Err(ARITHMETIC); }
    u64::try_from((a as u128) * (b as u128) / (d as u128)).map_err(|_| ARITHMETIC)
}
pub fn buy_cost(token: u64, sol: u64, amount: u64) -> Result<u64, ProgramError> {
    if amount == 0 || amount >= token { return Err(INVALID_AMOUNT); }
    ceil_mul_div(sol, amount, token - amount)
}
pub fn curve_buy_cost(token: u64, sol: u64, amount: u64) -> Result<u64, ProgramError> {
    if amount == 0 || amount >= token { return Err(INVALID_AMOUNT); }
    // Observed against the pinned Pump executable, including exact division.
    add(floor_mul_div(sol, amount, token - amount)?, 1)
}
pub fn sell_gross(token: u64, sol: u64, amount: u64) -> Result<u64, ProgramError> {
    if amount == 0 { return Err(INVALID_AMOUNT); }
    floor_mul_div(sol, amount, add(token, amount)?)
}
pub fn fees(gross: u64, graduated: bool) -> Result<(u64, u64, u64), ProgramError> {
    Ok((ceil_mul_div(gross, PLATFORM_BPS, 10_000)?,
        ceil_mul_div(gross, CREATOR_BPS, 10_000)?,
        if graduated { ceil_mul_div(gross, LP_BPS, 10_000)? } else { 0 }))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rounding_and_bounds() {
        assert_eq!(buy_cost(10, 100, 2).unwrap(), 25);
        assert_eq!(curve_buy_cost(10, 100, 2).unwrap(), 26);
        assert_eq!(buy_cost(10, 101, 2).unwrap(), 26);
        assert_eq!(sell_gross(10, 101, 2).unwrap(), 16);
        assert!(buy_cost(10, 100, 10).is_err());
        assert!(sell_gross(u64::MAX, 100, 1).is_err());
        assert_eq!(ceil_mul_div(u64::MAX, u64::MAX, u64::MAX).unwrap(), u64::MAX);
    }
    #[test]
    fn round_trip_cannot_extract_quote_before_fees() {
        let mut seed = 719u64;
        for _ in 0..10_000 {
            seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
            let amount = 1 + seed % REAL_TOKEN;
            let cost = curve_buy_cost(INITIAL_TOKEN, INITIAL_SOL, amount).unwrap();
            let sold = sell_gross(INITIAL_TOKEN-amount, INITIAL_SOL+cost, amount).unwrap();
            assert!(sold <= cost);
            let before = INITIAL_TOKEN as u128 * INITIAL_SOL as u128;
            let after = (INITIAL_TOKEN-amount) as u128 * (INITIAL_SOL+cost) as u128;
            assert!(after >= before);
        }
    }
    #[test]
    fn graduation_has_real_liquidity() {
        let raised = buy_cost(INITIAL_TOKEN, INITIAL_SOL, REAL_TOKEN).unwrap();
        assert!(raised > INITIAL_SOL * 8 / 3 && raised < INITIAL_SOL * 3);
        assert!(SUPPLY > REAL_TOKEN);
        let pool_base = SUPPLY - REAL_TOKEN;
        let cost = buy_cost(pool_base, raised, 1_000_000).unwrap();
        let (p,c,lp) = fees(cost, true).unwrap();
        assert!(p+c+lp > 0);
    }
    #[test]
    fn dust_cannot_underflow_sell_output() {
        let (p,c,lp) = fees(1, true).unwrap();
        assert!(1u64.checked_sub(p+c+lp).is_none());
    }
}
