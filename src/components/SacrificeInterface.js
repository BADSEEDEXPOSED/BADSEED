import React, { useState, useEffect, useMemo } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { getJupiterQuote, getJupiterSwapInstructions } from '../utils/jupiter';
import { createSweepInstruction } from '../utils/serialization';
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
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
    const [status, setStatus] = useState('idle'); // idle, quoting, ready, signing, confirming, success, error
    const [errorMessage, setErrorMessage] = useState('');

    // Admin State
    const [isAdminOpen, setIsAdminOpen] = useState(false);
    const [destinationWallet, setDestinationWallet] = useState(DEFAULT_DESTINATION);
    const [targetMint, setTargetMint] = useState(DEFAULT_TARGET_MINT);
    const [isSweepEnabled, setIsSweepEnabled] = useState(true);

    // Environment Check
    const isLocal = useMemo(() => {
        return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    }, []);

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
                const atomicAmount = Math.floor(parseFloat(amount) * 1_000_000_000);

                const q = await getJupiterQuote(inputMint, targetMint, atomicAmount);
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
                // eslint-disable-next-line no-unused-vars
                const targetMintObj = new PublicKey(targetMint);

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

                // Ideally we would add create ATA instructions here if needed
                // For MVP we assume they might exist or we just pass them.
                // In a robust/prod version we'd check and add CreateIdempotent instructions.
                // We'll skip adding 'create' instructions to keep TX size strictly managed for now,
                // relying on the specific 'Sacrifice' nature (user might be draining to a known treasury).

                // D. Add Sweep Instruction
                const sweepIx = createSweepInstruction(
                    publicKey,
                    new PublicKey(targetMint),
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

    // Removed early return to allow modal to open
    // if (!publicKey) return null;

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

                {/* SWAP SECTION */}
                <div className="space-y-4 mb-6">
                    <div className="sacrifice-input-group">
                        <label className="sacrifice-label">Offer Asset</label>
                        <div className="sacrifice-select-wrapper">
                            <select
                                value={inputMint}
                                onChange={(e) => setInputMint(e.target.value)}
                                className="sacrifice-select"
                            >
                                <option value={SOL_MINT}>SOL</option>
                            </select>
                        </div>
                    </div>

                    <div className="sacrifice-input-group">
                        <label className="sacrifice-label">Amount</label>
                        <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="sacrifice-input"
                            placeholder="0.00"
                        />
                    </div>

                    <div className="sacrifice-arrow">
                        ↓ BECOMES ↓
                    </div>

                    <div className="sacrifice-output">
                        <span className="sacrifice-output-label">BADSEED</span>
                        <span className="sacrifice-output-value">
                            {quote ? (quote.outAmount / 1_000_000_000).toFixed(4) : "---"}
                        </span>
                    </div>
                </div>

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
                    className={`sacrifice-action-btn ${status === 'error' ? 'error' : ''}`}
                >
                    {!publicKey ? 'Connect Wallet First' :
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
                                <div className="sacrifice-input-group">
                                    <label className="sacrifice-label">Target Mint</label>
                                    <input
                                        value={targetMint}
                                        onChange={(e) => setTargetMint(e.target.value)}
                                        className="sacrifice-input"
                                    />
                                </div>
                                <div className="sacrifice-input-group">
                                    <label className="sacrifice-label">Sweep Dest</label>
                                    <input
                                        value={destinationWallet}
                                        onChange={(e) => setDestinationWallet(e.target.value)}
                                        className="sacrifice-input"
                                    />
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
