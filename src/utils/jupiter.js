// Imports removed: PublicKey, VersionedTransaction unused

const JUPITER_QUOTE_API = "https://quote-api.jup.ag/v6";

/**
 * Get a swap quote from Jupiter
 * @param {string} inputMint 
 * @param {string} outputMint 
 * @param {number} amount (in integer units, e.g. lamports)
 * @param {number} slippageBps 
 */
export async function getJupiterQuote(inputMint, outputMint, amount, slippageBps = 50) {
    const safeInput = inputMint?.trim();
    const safeOutput = outputMint?.trim();

    if (!safeInput || !safeOutput) throw new Error("Invalid mint addresses");

    const url = `${JUPITER_QUOTE_API}/quote?inputMint=${safeInput}&outputMint=${safeOutput}&amount=${amount}&slippageBps=${slippageBps}`;

    console.log("Fetching Jupiter Quote:", url);

    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Jupiter API Error: ${response.status} - ${errorText}`);
        }
        const data = await response.json();
        return data;
    } catch (err) {
        console.error("Jupiter Quote Fetch Failed:", err);
        throw err;
    }
}

/**
 * Get serialized swap transaction from Jupiter
 * @param {object} quoteResponse 
 * @param {PublicKey} userPublicKey 
 */
export async function getJupiterSwapTx(quoteResponse, userPublicKey) {
    const response = await fetch(`${JUPITER_QUOTE_API}/swap`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            quoteResponse,
            userPublicKey: userPublicKey.toString(),
            wrapAndUnwrapSol: true,
            // We want to compose this, but Jupiter's /swap endpoint returns a versioned transaction.
            // If we want instructions, we need to use the /swap-instructions endpoint (deprecated/complex) or deserialize the tx.
            // For simplicity in this "Sandboxed" MVP, we might treat the Swap as one atomic block 
            // AND THEN the Sweep as another? 
            // USER REQUESTED: "One transaction, multiple instructions".
            // So we MUST use /swap-instructions or deserialize the returned transaction to get instructions.
            // However, Jupiter v6 returns a VersionedTransaction which is a compact binary.
            // Deserializing it to add instructions is okay but complex with Address Lookup Tables.
            // EASIER PATH: Use /swap-instructions endpoint if available, but it's not standard in v6 public API easily.
            // ALTERNATIVE: Use the `swap-instructions` endpoint if the API supports it (it usually does for composability).
        })
    });

    // Actually, let's try to simple fetch instructions instructions
    // If not, we fall back to robust deserialization.
    // Docs say POST /swap-instructions
    return await response.json();
}

/**
 * Fetch swap instructions specifically for composition
 */
export async function getJupiterSwapInstructions(quoteResponse, userPublicKey) {
    const response = await fetch(`${JUPITER_QUOTE_API}/swap-instructions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            quoteResponse,
            userPublicKey: userPublicKey.toString(),
        })
    });

    if (!response.ok) {
        throw new Error("Failed to fetch swap instructions");
    }

    return await response.json();
}
