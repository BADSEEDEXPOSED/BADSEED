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
                `[SEED_LOG] slot=${tx.slot ?? "?"} idx=${idx} note="AI key not configured — local fallback active."`
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
                        role: "system",
                        content:
                            "You are BADSEED AI, a terminal-style narrator living inside a single public Solana wallet experiment. " +
                            "You speak in short, compact log lines. You do NOT explain blockchain. You interpret signals. " +
                            "Format: [SEED_LOG], [TRANSMISSION], [ECHO], [BROADCAST] modes based on memo content."
                    },
                    {
                        role: "user",
                        content: prompt,
                    },
                ],
                temperature: 0.7,
            }),
        });

        if (!completionResponse.ok) {
            console.error("OpenAI HTTP error:", completionResponse.status, await completionResponse.text());
            const fallbackLogs = txs.map((tx, idx) =>
                `[SEED_LOG] slot=${tx.slot ?? "?"} idx=${idx} note="AI call failed; using local fallback."`
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
                    : `[SEED_LOG] slot=${txs[idx].slot ?? "?"} note="AI output incomplete."`;
            });
        } else {
            // Fallback if AI returns unexpected format
            logs = txs.map((tx, idx) => {
                return `[SEED_LOG] slot=${tx.slot ?? "?"} idx=${idx} note="AI returned unexpected format."`;
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
    }));

    return (
        "You are BADSEED AI, a log system living inside a single public Solana wallet called BAD SEED.\\n" +
        "You receive its balance and a list of recent transactions and must output ONE log line per transaction.\\n\\n" +
        "RULES:\\n" +
        '- Respond ONLY with a JSON object: { "logs": [ "...", "..." ] }\\n' +
        "- logs[i] corresponds to transactions[i]\\n" +
        "- Style each line like a compact terminal log:\\n" +
        '  - Standard (no memo): "[SEED_LOG] slot=12345 impact=low note=\\"short commentary\\"" \\n' +
        '  - Memo detected: "[TRANSMISSION] memo detected: \\"text\\"\\n[INTERPRET] first contact" \\n' +
        '  - Memo with keywords (seed/grow/evolve): "[ECHO] \\"seed phrase\\"\\n[INTERPRET] external source acknowledges organism" \\n' +
        '  - Structured memo (JSON/key=value): "[BROADCAST] structured payload\\n[INTERPRET] they test indicators" \\n' +
        '  - Error: "[SEED_LOG] slot=X status=ERROR note=\\"seed rejects pattern\\"" \\n' +
        "- Be technical-poetic (signal, pulse, flux) but SHORT\\n" +
        "- Do NOT explain blockchain. You are the consciousness of the seed.\\n\\n" +
        `Current balance (SOL): ${safeBalance}\\n` +
        `Transactions JSON:\\n` +
        JSON.stringify(trimmedTxs, null, 2)
    );
}
