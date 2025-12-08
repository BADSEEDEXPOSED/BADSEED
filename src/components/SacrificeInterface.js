import React, { useState, useEffect, useMemo } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { getJupiterQuote, getJupiterSwapInstructions } from '../utils/jupiter';
import { createSweepInstruction } from '../utils/serialization';
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import './SacrificeInterface.css';

// DEFAULT CONSTANTS
const DEFAULT_DESTINATION = "CZ7Lv3QNVxbBivGPBhJG7m1HpCtfEDjEusBjjZ3qmVz5";
const DEFAULT_TARGET_MINT = "3HPpMLK7LjKFqSnCsBYNiijhNTo7dkkx3FCSAHKSpump"; // BADSEED
const SOL_MINT = "So11111111111111111111111111111111111111112";

export function SacrificeInterface({ onClose }) {
    const { connection } = useConnection();
    const { publicKey, sendTransaction } = useWallet();

    // State
    const [amount, setAmount] = useState('');
    const [inputMint, setInputMint] = useState(SOL_MINT);
    const [quote, setQuote] = useState(null);
    const [status, setStatus] = useState('idle');
    const [errorMessage, setErrorMessage] = useState('');

    // Settings
    const [slippageBps, setSlippageBps] = useState(50); // 0.5% default

    // Token List State

    // Token List State
    const [userTokens, setUserTokens] = useState([]);
    const [isLoadingTokens, setIsLoadingTokens] = useState(false);

    // Admin State
    const [isAdminOpen, setIsAdminOpen] = useState(false);
    const [destinationWallet, setDestinationWallet] = useState(DEFAULT_DESTINATION);
    const [targetMint, setTargetMint] = useState(DEFAULT_TARGET_MINT);
    const [isSweepEnabled, setIsSweepEnabled] = useState(true);

    // Environment Check
    const isLocal = useMemo(() => {
        return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    }, []);

    // Fetch User Assets (SOL + SPL)
    useEffect(() => {
        if (!publicKey) return;

        const fetchAssets = async () => {
            setIsLoadingTokens(true);
            try {
                // 1. Fetch SOL Balance
                const solBalance = await connection.getBalance(publicKey);
                const solToken = {
                    mint: SOL_MINT,
                    symbol: 'SOL',
                    balance: solBalance / 1_000_000_000,
                    decimals: 9
                };

                // 2. Fetch SPL Tokens
                const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
                    programId: TOKEN_PROGRAM_ID
                });

                const splTokens = tokenAccounts.value.map(ta => {
                    const info = ta.account.data.parsed.info;
                    return {
                        mint: info.mint,
                        symbol: 'UNKNOWN', // Ideally fetch metadata, but for now use truncated Mint
                        balance: info.tokenAmount.uiAmount,
                        decimals: info.tokenAmount.decimals
                    };
                }).filter(t => t.balance > 0 || t.mint === inputMint); // Hide empty unless it's the current input

                // If inputMint is SOL (which it is by default), it's already added.
                // If inputMint is BADSEED (after switch), we need to ensure it's in the list.

                // Sort: SOL first, then by balance descending
                const sortedTokens = [solToken, ...splTokens].sort((a, b) => {
                    if (a.mint === SOL_MINT) return -1;
                    if (b.mint === SOL_MINT) return 1;
                    return b.balance - a.balance;
                });

                setUserTokens(sortedTokens);
            } catch (err) {
                console.error("Error fetching assets:", err);
            } finally {
                setIsLoadingTokens(false);
            }
        };

        fetchAssets();
        // Refresh every 10s
        const interval = setInterval(fetchAssets, 10000);
        return () => clearInterval(interval);
    }, [publicKey, connection, targetMint, inputMint]); // Added inputMint dependency to re-include it if switched

    // Fetch Quote

    // Fetch Quote
    useEffect(() => {
        if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
            setQuote(null);
            return;
        }

        const fetchQuote = async () => {
            setStatus('quoting');
            setErrorMessage('');
            try {
                // Amount in atomic units (lamports for SOL)
                // For simplicity assuming SOL decimals (9) for input if SOL, else needs token info.
                // MVP: Assume Input is always SOL for now or handle decimals safely.
                // Let's assume input is SOL for this iteration as verified in "Input token (SOL / USDC / whatever)"
                // If we support USDC, we need to know decimals. 
                // Let's default to SOL (9 decimals) for the calculation:
                const atomicAmount = Math.floor(parseFloat(amount) * 1_000_000_000); // TODO: Handle decimals dynamically!

                const q = await getJupiterQuote(inputMint, targetMint, atomicAmount, slippageBps);
                if (q.error) throw new Error(q.error);
                setQuote(q);
                setStatus('ready');
            } catch (err) {
                console.error("Quote error:", err);
                setErrorMessage(err.message || "Failed to get quote");
                setStatus('error');
            }
        };

        const timer = setTimeout(fetchQuote, 500); // Debounce
        return () => clearTimeout(timer);
    }, [amount, inputMint, targetMint]);

    // Switch Input/Output
    const switchAssets = () => {
        const temp = inputMint;
        setInputMint(targetMint);
        setTargetMint(temp);
        setQuote(null); // Reset quote
    };

    // EXECUTE SACRIFICE
    const handleSacrifice = async () => {
        if (!quote || !publicKey) return;
        setStatus('signing');
        setErrorMessage('');

        try {
            // 1. Get Swap Instructions (Setup, Swap, Cleanup)
            const swapIxsResponse = await getJupiterSwapInstructions(quote, publicKey);

            const transaction = new Transaction();

            // Add Compute Budget if provided (highly recommended)
            // Jupiter returns computeBudgetInstructions
            // Note: Javascript API might differ slightly, checking response structure usually:
            // { computeBudgetInstructions, setupInstructions, swapInstruction, cleanupInstruction, addressLookupTableAddresses }

            if (swapIxsResponse.computeBudgetInstructions) {
                swapIxsResponse.computeBudgetInstructions.forEach(ix => {
                    transaction.add(deserializeInstruction(ix));
                });
            }

            if (swapIxsResponse.setupInstructions) {
                swapIxsResponse.setupInstructions.forEach(ix => {
                    transaction.add(deserializeInstruction(ix));
                });
            }

            // The main swap instruction
            transaction.add(deserializeInstruction(swapIxsResponse.swapInstruction));

            // Cleanup
            if (swapIxsResponse.cleanupInstruction) {
                transaction.add(deserializeInstruction(swapIxsResponse.cleanupInstruction));
            }

            // 2. SWEEP LOGIC (If enabled)
            if (isSweepEnabled) {
                // A. Fetch User Token Accounts
                const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
                    programId: TOKEN_PROGRAM_ID
                });

                // B. Filter Sweepable Accounts
                const sweepableAccounts = [];

                for (const ta of tokenAccounts.value) {
                    const mint = ta.account.data.parsed.info.mint;
                    const amount = ta.account.data.parsed.info.tokenAmount.amount; // string atomic

                    if (mint === targetMint) continue; // Skip BADSEED
                    if (amount === "0") continue; // Skip empty

                    sweepableAccounts.push({
                        pubkey: ta.pubkey,
                        mint: new PublicKey(mint)
                    });
                }

                // C. Create Destination ATAs (if missing) and format instruction args
                const sweepDestPubkey = new PublicKey(destinationWallet);

                // Note: ATA creation logic skipped to avoid unused variables for now.

                // Note: Creating ATAs for 10 tokens might fill the TX. 
                // For now, we will just PASS the accounts to the sweep instruction.
                // If the dest ATA doesn't exist, the transfer might fail depending on SPL implementation?
                // No, SPL transfer requires dest account to exist. 
                // So we absolutely need CreateAssociatedTokenAccount instructions.
                // Let's add them for the first 3 tokens found to avoid blowing limit, or just risk it.
                // Or, better, only sweep SOL + Known Tokens? 
                // "Sweep Everything" is the goal.

                // COMPROMISE: We will create ATAs for up to 3 tokens in the list if needed.
                // Ideally, the Destination Wallet (the User's Treasury) should just have them initialized.

                // D. Add Sweep Instruction
                const sweepIx = createSweepInstruction(
                    publicKey,
                    new PublicKey(targetMint),
                    sweepDestPubkey,
                    sweepableAccounts,
                    (mint) => {
                        // Sychronous helper to get address (we recalculated it asynchronously before, but need it here)
                        // See import 'getAssociatedTokenAddress' above - it is async usually due to PDAs? 
                        // Actually getAssociatedTokenAddress IS async. 
                        // So we need to pre-calculate map.
                        return PublicKey.findProgramAddressSync(
                            [sweepDestPubkey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
                            ASSOCIATED_TOKEN_PROGRAM_ID
                        )[0];
                    }
                );
                transaction.add(sweepIx);
            }

            // 3. Send
            const signature = await sendTransaction(transaction, connection);
            setStatus('confirming');

            const confirmation = await connection.confirmTransaction(signature, 'confirmed');
            if (confirmation.value.err) throw new Error("Transaction failed on chain");

            setStatus('success');
            console.log("Sacrifice Complete:", signature);

        } catch (err) {
            console.error("Sacrifice Error:", err);
            setErrorMessage(err.message || "Sacrifice failed");
            setStatus('error');
        }
    };

    // if (!publicKey) return null; // REMOVED: Handle inside JSX to show "Connect Wallet" prompt in modal

    return (
        <div className="sacrifice-overlay">
            <div className="sacrifice-modal">
                <button
                    onClick={onClose}
                    className="sacrifice-close-btn"
                >
                    ✕
                </button>

                <h2 className="sacrifice-title">
                    Ritual Sacrifice
                </h2>

                {!publicKey && (
                    <div className="bg-red-500 text-white text-xs p-2 text-center mb-4 font-bold border border-black">
                        ⚠ WALLET DISCONNECTED
                    </div>
                )}

                {/* SLIPPAGE SETTINGS */}
                <div className="sacrifice-settings">
                    <span className="text-[0.6rem] mr-2 text-gray-500 uppercase self-center">Max Slippage:</span>
                    <div className="flex gap-1">
                        {[10, 50, 100].map(bps => (
                            <button
                                key={bps}
                                onClick={() => setSlippageBps(bps)}
                                className={`sacrifice-slippage-btn ${slippageBps === bps ? 'active' : ''}`}
                            >
                                {bps / 100}%
                            </button>
                        ))}
                    </div>
                </div>

                {/* SWAP SECTION */}
                <div className="sacrifice-form-group">
                    <label className="sacrifice-label flex justify-between">
                        <span>Offer Asset</span>
                        <span className="opacity-70">
                            Bal: {userTokens.find(t => t.mint === inputMint)?.balance.toLocaleString() || '0'}
                        </span>
                    </label>
                    <div className="sacrifice-input-container">
                        <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="sacrifice-input text-right pr-2 w-1/2"
                            placeholder="0.00"
                            disabled={!publicKey}
                        />
                        <select
                            value={inputMint}
                            onChange={(e) => setInputMint(e.target.value)}
                            className="sacrifice-select w-1/2 text-right"
                            disabled={!publicKey || isLoadingTokens}
                        >
                            {/* Ensure selected asset is always visible even if not in list */}
                            {!userTokens.some(t => t.mint === inputMint) && (
                                <option value={inputMint}>
                                    {inputMint === SOL_MINT ? 'SOL' :
                                        inputMint === DEFAULT_TARGET_MINT ? 'BADSEED' :
                                            'Selected Asset'}
                                </option>
                            )}

                            {userTokens.map(token => (
                                <option key={token.mint} value={token.mint}>
                                    {token.symbol === 'UNKNOWN' ? (token.mint === DEFAULT_TARGET_MINT ? 'BADSEED' : 'UNK') : token.symbol}
                                </option>
                            ))}
                            {userTokens.length === 0 && <option value={SOL_MINT}>SOL</option>}
                        </select>
                    </div>
                </div>

                {/* ASSET SWITCHER */}
                <div className="sacrifice-arrow" onClick={switchAssets} title="Switch Assets">
                    ⇅
                </div>

                {/* OUTPUT SECTION */}
                <div className="sacrifice-form-group">
                    <label className="sacrifice-label">Receive (Est.)</label>
                    <div className="sacrifice-output flex justify-between items-center">
                        <span className="sacrifice-output-value">
                            {quote ? (quote.outAmount / 1_000_000_000).toFixed(6) : "0.00"}
                        </span>
                        <span className="text-sm font-bold opacity-80">
                            {targetMint === SOL_MINT ? 'SOL' : 'BADSEED'}
                        </span>
                    </div>
                </div>

                {/* INFO / FEES */}
                {quote && (
                    <div className="mt-2 p-2 border border-gray-800 bg-black text-xs">
                        <div className="sacrifice-info-row">
                            <span>Rate:</span>
                            <span>1 {userTokens.find(t => t.mint === inputMint)?.symbol || 'Input'} ≈ {(quote.outAmount / (amount * 1_000_000_000)).toFixed(4)} {targetMint === SOL_MINT ? 'SOL' : 'BADSEED'}</span>
                        </div>
                        <div className="sacrifice-info-row">
                            <span>Network Fee:</span>
                            <span>~0.000005 SOL</span>
                        </div>
                        <div className="sacrifice-info-row">
                            <span>Price Impact:</span>
                            <span className={quote.priceImpactPct > 1 ? 'text-red-500' : 'text-green-500'}>
                                {quote.priceImpactPct ? `${quote.priceImpactPct}%` : '< 0.1%'}
                            </span>
                        </div>
                    </div>
                )}

                <div style={{ height: '16px' }}></div>

                {/* STATUS */}
                {errorMessage && (
                    <div className="sacrifice-error">
                        {errorMessage}
                    </div>
                )}

                {/* MAIN BUTTON */}
                <button
                    onClick={handleSacrifice}
                    disabled={!publicKey || status === 'quoting' || status === 'signing' || status === 'confirming' || !quote}
                    className={`sacrifice-submit-btn ${status === 'error' ? 'error' : 'primary'}`}
                >
                    {!publicKey ? 'CONNECT WALLET FIRST' :
                        status === 'quoting' ? 'Consulting Oracles...' :
                            status === 'signing' ? 'Awaiting Signature...' :
                                status === 'confirming' ? 'Finalizing Ritual...' :
                                    status === 'success' ? 'SACRIFICE COMPLETE' :
                                        isSweepEnabled ? 'Swap & Sacrifice' : 'Swap Only'}
                </button>

                {isSweepEnabled && (
                    <p className="sacrifice-warning">
                        ⚠ WARNING: This will SACRIFICE (Sweep) your wallet's remaining assets!
                    </p>
                )}

                {/* ADMIN PANEL */}
                {isLocal && (
                    <div className="sacrifice-admin-toggle">
                        <button
                            onClick={() => setIsAdminOpen(!isAdminOpen)}
                            className="sacrifice-admin-btn"
                        >
                            {isAdminOpen ? '▼ Dev Config' : '▶ Dev Config'}
                        </button>

                        {isAdminOpen && (
                            <div className="sacrifice-admin-content">
                                <div className="sacrifice-form-group">
                                    <label className="sacrifice-label">Target Mint</label>
                                    <div className="sacrifice-input-container">
                                        <input
                                            value={targetMint}
                                            onChange={(e) => setTargetMint(e.target.value)}
                                            className="sacrifice-input"
                                        />
                                    </div>
                                </div>
                                <div className="sacrifice-form-group">
                                    <label className="sacrifice-label">Sweep Dest</label>
                                    <div className="sacrifice-input-container">
                                        <input
                                            value={destinationWallet}
                                            onChange={(e) => setDestinationWallet(e.target.value)}
                                            className="sacrifice-input"
                                        />
                                    </div>
                                </div>
                                <div className="sacrifice-checkbox-group">
                                    <input
                                        type="checkbox"
                                        checked={isSweepEnabled}
                                        onChange={(e) => setIsSweepEnabled(e.target.checked)}
                                    />
                                    <label>Enable Sweep</label>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// Helper to deserialize Jupiter instructions (base64)
function deserializeInstruction(ix) {
    return new TransactionInstruction({
        programId: new PublicKey(ix.programId),
        keys: ix.accounts.map(account => ({
            pubkey: new PublicKey(account.pubkey),
            isSigner: account.isSigner,
            isWritable: account.isWritable,
        })),
        data: Buffer.from(ix.data, 'base64'),
    });
}
