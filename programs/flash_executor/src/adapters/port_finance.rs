use anchor_lang::prelude::*;
// Placeholder for a real Port Finance flash-loan CPI adapter.
pub fn flash_borrow<'info>(_amount: u64, _ctx: &Context<'_, '_, '_, 'info, ()>) -> Result<()> { Ok(()) }
pub fn flash_repay<'info>(_amount: u64, _ctx: &Context<'_, '_, '_, 'info, ()>) -> Result<()> { Ok(()) }
