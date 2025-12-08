import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { sha256 } from "js-sha256";

// Program ID defined in lib.rs
export const PROGRAM_ID = new PublicKey("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

// Helper to calculate Anchor instruction discriminator
// input: "global:<instruction_name>"
function getSighash(name) {
    const hash = sha256.digest(`global:${name}`);
    return new Uint8Array(hash.slice(0, 8));
}

// Instruction Discriminator for "sweep_except_badseed"
const SWEEP_DISCRIMINATOR = getSighash("sweep_except_badseed");

/**
 * Creates the sweep_except_badseed instruction
 * 
 * @param {PublicKey} userWallet - The user's wallet (signer)
 * @param {PublicKey} badseedMint - The BADSEED mint to exclude
 * @param {PublicKey} sweepDestination - The destination wallet
 * @param {Array<{pubkey: PublicKey, mint: PublicKey}>} userTokenAccounts - List of user token accounts
 * @param {Function} getDestinationAta - Function to get destination ATA for a mint (pubkey)
 * @returns {TransactionInstruction}
 */
export function createSweepInstruction(
    userWallet,
    badseedMint,
    sweepDestination,
    userTokenAccounts,
    getDestinationAta
) {
    const keys = [
        { pubkey: userWallet, isSigner: true, isWritable: true },
        { pubkey: sweepDestination, isSigner: false, isWritable: true },
        { pubkey: badseedMint, isSigner: false, isWritable: false },
        { pubkey: PublicKey.default, isSigner: false, isWritable: false }, // System Program (placeholder, fixed below)
        { pubkey: PublicKey.default, isSigner: false, isWritable: false }, // Token Program (placeholder, fixed below)
    ];

    // Fix System and Token program keys
    // System Program: 11111111111111111111111111111111
    const SYSTEM_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");
    const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

    keys[3] = { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false };
    keys[4] = { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false };

    // Add Remaining Accounts (Pairs: UserToken, DestToken)
    for (const account of userTokenAccounts) {
        const destAta = getDestinationAta(account.mint);

        // User Token Account (Source)
        keys.push({ pubkey: account.pubkey, isSigner: false, isWritable: true });
        // Destination Token Account
        keys.push({ pubkey: destAta, isSigner: false, isWritable: true });
    }

    // Data: Just the 8-byte discriminator since there are no other arguments
    const data = Buffer.from(SWEEP_DISCRIMINATOR);

    return new TransactionInstruction({
        keys,
        programId: PROGRAM_ID,
        data,
    });
}
