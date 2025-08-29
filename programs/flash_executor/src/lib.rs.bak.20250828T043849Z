#![allow(unexpected_cfgs)]
#![allow(deprecated)]

use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::{invoke, invoke_signed},
};
use anchor_spl::token_interface::{
    Mint, TokenAccount as IfaceTokenAccount, TokenInterface as Token,
};

declare_id!("9ckBy54vd9G6FmR63Z4PoLtNq8rbtoYzhVbJGx458Kmn");

#[program]
pub mod flash_executor {
    use super::*;

    // ─────────────────────────────────────────────────────────────────────────
    // One-time global init
    // ─────────────────────────────────────────────────────────────────────────
    pub fn initialize_global(ctx: Context<InitializeGlobal>, owner: Pubkey) -> Result<()> {
        let g = &mut ctx.accounts.global;
        g.owner = owner;
        g.executor_limit = MAX_EXECUTORS as u16;
        g.whitelist_limit = MAX_WHITELIST as u16;
        g.executors.clear();
        g.whitelisted.clear();
        Ok(())
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Owner: add/remove an executor
    // ─────────────────────────────────────────────────────────────────────────
    pub fn set_executor(ctx: Context<OwnerOnly>, exec: Pubkey, enable: bool) -> Result<()> {
        let g = &mut ctx.accounts.global;

        if enable {
            if !g.executors.iter().any(|k| *k == exec) {
                require!(
                    (g.executors.len() as u16) < g.executor_limit,
                    FlashError::TooManyExecutors
                );
                g.executors.push(exec);
            }
        } else if let Some(i) = g.executors.iter().position(|k| *k == exec) {
            g.executors.swap_remove(i);
        }
        Ok(())
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Owner: add/remove a whitelisted DEX program
    // ─────────────────────────────────────────────────────────────────────────
    pub fn set_whitelist(ctx: Context<OwnerOnly>, program_id: Pubkey, enable: bool) -> Result<()> {
        let g = &mut ctx.accounts.global;

        if enable {
            if !g.whitelisted.iter().any(|k| *k == program_id) {
                require!(
                    (g.whitelisted.len() as u16) < g.whitelist_limit,
                    FlashError::TooManyWhitelisted
                );
                g.whitelisted.push(program_id);
            }
        } else if let Some(i) = g.whitelisted.iter().position(|k| *k == program_id) {
            g.whitelisted.swap_remove(i);
        }
        Ok(())
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Create a pool; vault ATA must already exist with `vault_authority` owner.
    // ─────────────────────────────────────────────────────────────────────────
    pub fn create_pool(ctx: Context<CreatePool>, min_profit_bps: u16) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        let global = &ctx.accounts.global;

        // Avoid reborrrowing `ctx.accounts.pool` immutably; use `pool.key()`.
        let pkey = pool.key();
        let seeds = [b"vault_auth", pkey.as_ref()];
        let (pda, bump) = Pubkey::find_program_address(&seeds, ctx.program_id);
        require_keys_eq!(pda, ctx.accounts.vault_authority.key(), FlashError::InvalidVaultAuthority);

        // Vault sanity
        require_keys_eq!(ctx.accounts.vault.mint, ctx.accounts.mint.key(), FlashError::VaultMintMismatch);
        require_keys_eq!(ctx.accounts.vault.owner, ctx.accounts.vault_authority.key(), FlashError::VaultOwnerMismatch);

        pool.owner = global.owner;
        pool.mint = ctx.accounts.mint.key();
        pool.vault = ctx.accounts.vault.key();
        pool.vault_authority_bump = bump;
        pool.min_profit_bps = min_profit_bps;
        pool.enabled = true;
        Ok(())
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Owner: update pool params
    // ─────────────────────────────────────────────────────────────────────────
    pub fn set_pool_params(ctx: Context<OwnerOnlyPool>, min_profit_bps: u16, enabled: bool) -> Result<()> {
        let p = &mut ctx.accounts.pool;
        p.min_profit_bps = min_profit_bps;
        p.enabled = enabled;
        Ok(())
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Execute a route atomically with on-chain profit delta check.
    // All AccountInfos passed to CPI are sourced from `remaining_accounts`
    // to keep a single lifetime and avoid variance issues.
    // ─────────────────────────────────────────────────────────────────────────
    pub fn execute_route(
        mut ctx: Context<ExecuteRoute>,
        principal: u64,
        route: Vec<SerializedInstruction>,
    ) -> Result<()> {
        let accs = &mut ctx.accounts;

        // Authorization
        let caller = accs.caller.key();
        require!(
            accs.global.is_executor(&caller) || caller == accs.global.owner,
            FlashError::NotExecutor
        );
        require!(accs.pool.enabled, FlashError::PoolDisabled);

        // PDA check for vault authority
        let pool_key = accs.pool.key();
        let (pda, bump) = {
            let seeds = [b"vault_auth", pool_key.as_ref()];
            Pubkey::find_program_address(&seeds, ctx.program_id)
        };
        require_keys_eq!(pda, accs.vault_authority.key(), FlashError::InvalidVaultAuthority);

        // Start balance
        let start: u64 = accs.vault.amount;

        // For CPI AccountInfo sourcing: use only `remaining_accounts`
        let rem: &[AccountInfo<'_>] = ctx.remaining_accounts;

        // Helper to find an AccountInfo by key within `rem`
        let find_ai = |k: &Pubkey| -> Result<AccountInfo<'_>> {
            rem.iter()
                .find(|ai| ai.key() == *k)
                .cloned()
                .ok_or(FlashError::MissingAccount.into())
        };

        // Optionally enforce that the canonical accounts ALSO appear in rem
        // (prevents callers from omitting or swapping them in CPIs)
        for expected in [
            accs.global.key(),
            accs.pool.key(),
            accs.vault.key(),
            accs.vault_authority.key(),
            accs.caller.key(),
            accs.token_program.key(),
        ] {
            // Fails early if any are missing
            let _ = find_ai(&expected)?;
        }

        let v_auth_key = accs.vault_authority.key();

        for step in route.iter() {
            // Only pre-approved DEX programs
            require!(
                accs.global.is_whitelisted(&step.program_id),
                FlashError::DexNotWhitelisted
            );

            let needs_pda_sign = step.metas.iter().any(|m| m.is_signer && m.pubkey == v_auth_key);

            // Program account must come from `rem`
            let prog_ai = find_ai(&step.program_id)?;

            let metas: Vec<AccountMeta> = to_account_metas(&step.metas);

            // Build AccountInfos strictly from `rem` so all lifetimes are the same
            let mut infos: Vec<AccountInfo<'_>> = Vec::with_capacity(step.metas.len() + 1);
            infos.push(prog_ai);

            for m in step.metas.iter() {
                let ai = find_ai(&m.pubkey)?;
                infos.push(ai);
            }

            let ix = Instruction {
                program_id: step.program_id,
                accounts: metas,
                data: step.data.clone(),
            };

            if needs_pda_sign {
                let signer_seeds: &[&[u8]] = &[b"vault_auth", pool_key.as_ref(), &[bump]];
                invoke_signed(&ix, &infos, &[signer_seeds])?;
            } else {
                invoke(&ix, &infos)?;
            }
        }

        // Reload vault and enforce profit delta
        accs.vault.reload()?;
        let end: u64 = accs.vault.amount;

        let min_profit_u128 = (principal as u128) * (accs.pool.min_profit_bps as u128) + 9_999;
        let min_profit = (min_profit_u128 / 10_000).try_into().unwrap_or(u64::MAX);

        require!(end >= start.saturating_add(min_profit), FlashError::InsufficientProfit);
        Ok(())
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Accounts
// ─────────────────────────────────────────────────────────────────────────────

const MAX_EXECUTORS: usize = 32;
const MAX_WHITELIST: usize = 64;

#[account]
pub struct GlobalConfig {
    pub owner: Pubkey,
    pub executors: Vec<Pubkey>,
    pub whitelisted: Vec<Pubkey>,
    pub executor_limit: u16,
    pub whitelist_limit: u16,
}

impl GlobalConfig {
    pub const INIT_SPACE: usize =
        8 + 32 + (4 + MAX_EXECUTORS * 32) + (4 + MAX_WHITELIST * 32) + 2 + 2;

    pub fn is_executor(&self, k: &Pubkey) -> bool {
        self.executors.iter().any(|x| x == k)
    }
    pub fn is_whitelisted(&self, p: &Pubkey) -> bool {
        self.whitelisted.iter().any(|x| x == p)
    }
}

#[account]
pub struct TokenPool {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub vault_authority_bump: u8,
    pub min_profit_bps: u16,
    pub enabled: bool,
}

impl TokenPool {
    pub const INIT_SPACE: usize = 8 + 32 + 32 + 32 + 1 + 2 + 1;
}

#[derive(Accounts)]
pub struct InitializeGlobal<'info> {
    #[account(init, payer = payer, space = GlobalConfig::INIT_SPACE)]
    pub global: Account<'info, GlobalConfig>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct OwnerOnly<'info> {
    #[account(mut, has_one = owner)]
    pub global: Account<'info, GlobalConfig>,
    #[account(mut)]
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct OwnerOnlyPool<'info> {
    #[account(mut, has_one = owner)]
    pub global: Account<'info, GlobalConfig>,
    #[account(mut)]
    pub pool: Account<'info, TokenPool>,
    #[account(mut)]
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct CreatePool<'info> {
    #[account(mut, has_one = owner)]
    pub global: Account<'info, GlobalConfig>,

    #[account(
        init,
        payer = owner,
        space = TokenPool::INIT_SPACE,
        seeds = [b"pool", mint.key().as_ref(), owner.key().as_ref()],
        bump
    )]
    pub pool: Account<'info, TokenPool>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: Verified via PDA check in handler
    pub vault_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub vault: InterfaceAccount<'info, IfaceTokenAccount>,

    pub token_program: Interface<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteRoute<'info> {
    #[account(mut)]
    pub global: Account<'info, GlobalConfig>,
    #[account(mut)]
    pub pool: Account<'info, TokenPool>,

    /// CHECK: PDA; verified in handler
    pub vault_authority: UncheckedAccount<'info>,

    #[account(mut, token::mint = pool.mint)]
    pub vault: InterfaceAccount<'info, IfaceTokenAccount>,

    pub caller: Signer<'info>,
    pub token_program: Interface<'info, Token>,
}

// ─────────────────────────────────────────────────────────────────────────────
// Wire types and helpers
// ─────────────────────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct WireMeta {
    pub pubkey: Pubkey,
    pub is_signer: bool,
    pub is_writable: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SerializedInstruction {
    pub program_id: Pubkey,
    pub metas: Vec<WireMeta>,
    pub data: Vec<u8>,
}

fn to_account_metas(w: &[WireMeta]) -> Vec<AccountMeta> {
    w.iter()
        .map(|m| {
            if m.is_writable {
                AccountMeta::new(m.pubkey, m.is_signer)
            } else {
                AccountMeta::new_readonly(m.pubkey, m.is_signer)
            }
        })
        .collect()
}

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

#[error_code]
pub enum FlashError {
    #[msg("Caller is not an authorized executor")]
    NotExecutor,
    #[msg("Pool is disabled")]
    PoolDisabled,
    #[msg("DEX program not whitelisted")]
    DexNotWhitelisted,
    #[msg("Insufficient profit after route")]
    InsufficientProfit,
    #[msg("Invalid vault authority PDA")]
    InvalidVaultAuthority,
    #[msg("Vault owner mismatch")]
    VaultOwnerMismatch,
    #[msg("Vault mint mismatch")]
    VaultMintMismatch,
    #[msg("Missing account in remaining list")]
    MissingAccount,
    #[msg("Too many executors configured")]
    TooManyExecutors,
    #[msg("Too many whitelisted programs configured")]
    TooManyWhitelisted,
}
