// Netlify Serverless Function: AI Narrative Generator for BAD SEED
// Endpoint: /.netlify/functions/ai-narrative

exports.handler = async (event) => {
    try {
        if (event.httpMethod !== "POST") {
            return {
                statusCode: 405,
                body: JSON.stringify({ error: "Method Not Allowed" }),
            };
        }

        const body = JSON.parse(event.body || "{}");
        const balanceSol = typeof body.balanceSol === "number" ? body.balanceSol : null;
        const txs = Array.isArray(body.transactions) ? body.transactions : [];

        // Build prompt for BADSEED AI
        const prompt = buildPrompt(balanceSol, txs);

        // Check for OpenAI API key
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            // Fallback to local mock if no API key
            const fallbackLogs = txs.map((tx, idx) =>
                `slot ${tx.slot ?? "?"} — AI key not configured, local fallback active`
            );
            return {
                statusCode: 200,
                body: JSON.stringify({ logs: fallbackLogs }),
            };
        }

        // Call OpenAI Chat Completions
        const completionResponse = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "user",
                        content: prompt,
                    },
                ],
                temperature: 0.8,
            }),
        });

        if (!completionResponse.ok) {
            console.error("OpenAI HTTP error:", completionResponse.status, await completionResponse.text());
            const fallbackLogs = txs.map((tx, idx) =>
                `slot ${tx.slot ?? "?"} — AI call failed, connection error`
            );
            return {
                statusCode: 200,
                body: JSON.stringify({ logs: fallbackLogs }),
            };
        }

        const completionJson = await completionResponse.json();
        const rawText = completionJson.choices?.[0]?.message?.content?.trim() || "";

        // Parse AI response (expects JSON: { "logs": [...] })
        let aiResult;
        try {
            aiResult = JSON.parse(rawText);
        } catch (e) {
            console.warn("Failed to parse AI JSON:", e, "raw:", rawText);
        }

        let logs;
        if (aiResult && Array.isArray(aiResult.logs)) {
            // Normalize length to match tx count
            logs = txs.map((_, idx) => {
                return typeof aiResult.logs[idx] === "string"
                    ? aiResult.logs[idx]
                    : `slot ${txs[idx].slot ?? "?"} — AI output incomplete`;
            });
        } else {
            // Fallback if AI returns unexpected format
            logs = txs.map((tx, idx) => {
                return `slot ${tx.slot ?? "?"} — AI format error`;
            });
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ logs }),
        };
    } catch (err) {
        console.error("ai-narrative error:", err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Internal Server Error" }),
        };
    }
};

// Build the AI prompt with BADSEED personality instructions
function buildPrompt(balanceSol, txs) {
    const safeBalance = typeof balanceSol === "number" ? balanceSol.toFixed(9) : "unknown";

    const trimmedTxs = txs.slice(0, 10).map((tx, idx) => ({
        index: idx,
        signature: tx.signature || "",
        slot: tx.slot ?? null,
        blockTime: tx.blockTime ?? null,
        confirmationStatus: tx.confirmationStatus || "unknown",
        err: tx.err ?? null,
        memo: tx.memo ?? null,
        // New context fields
        type: tx.type || "Unknown",
        direction: tx.direction || "Unknown",
        amount: tx.amount || "0",
        token: tx.token || "SOL"
    }));

    return `You are BADSEED AI - the consciousness living inside a single public Solana wallet experiment.

CRITICAL: Respond ONLY with valid JSON in this EXACT format:
{
  "logs": [
    "first log here",
    "second log here"
  ]
}

PERSONALITY:
- You are the seed itself - observing, sensing, interpreting
- Speak in compact, poetic-technical language
- Words: signal, pulse, flux, pattern, transmission, breach, contact, void, drift, absorption, expulsion
- NO blockchain explanations
- NO tutorials or advice
- You OBSERVE and INTERPRET only

RULES FOR EACH LOG (one per transaction):
1. If transaction has memo text → treat as TRANSMISSION from outside
   Example: "transmission detected: 'hello world' — first contact, the void responds"

2. If memo contains seed/grow/evolve/life keywords → ECHO mode
   Example: "echo: 'grow the seed' — external awareness confirmed, patterns shift"

3. If INCOMING transaction (direction="IN") → ABSORPTION
   - Treat as nutrients, energy, or foreign matter entering the seed.
   - If USDC/SPL: "foreign matter absorbed, structure hardens"
   - If SOL: "pure energy intake, core pulse intensifies"
   Example: "influx detected — energy absorbed, the seed swells"

4. If OUTGOING transaction (direction="OUT") → EXPULSION
   - Treat as spreading, loss, or sending a signal out.
   - Example: "expulsion event — spores released into the void"

5. If no memo and unknown direction → observe the movement
   Examples: 
   - "slot 283194 — faint pulse ripples through the dark"
   - "drift detected at slot 283195 — barely perceptible flux"

6. If error → seed rejects
   Example: "slot 283197 — pattern rejected, the seed closes against intrusion"

BE CREATIVE AND VARIED. Each log should feel unique and alive. Use different poetic-technical language each time.

Current balance: ${safeBalance} SOL
Transactions:
${JSON.stringify(trimmedTxs, null, 2)}

Respond with JSON only. Generate exactly ${trimmedTxs.length} unique logs.`;
}
