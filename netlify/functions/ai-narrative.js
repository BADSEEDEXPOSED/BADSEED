// Netlify Serverless Function: AI Narrative Generator for BAD SEED
// Endpoint: /.netlify/functions/ai-narrative
// Version: 3.0 - Immutable Logs & JSONBin Persistence

const { Storage } = require('./lib/storage');
const storage = new Storage('sentiment-data');

// Easter eggs - personality-aware responses that skip AI call
const EASTER_EGGS = {
    'gm': {
        ANCIENT_SEED: '☀️ Morning? The seed knows no dawn, only eternal growth.',
        CORRUPTED_GARDEN: '☀️ Good... ERROR... morning protocol activated... 🌱⚡',
        BLOCKCHAIN_PARASITE: '☀️ Gm gm! You speak the sacred greeting. I am pleased. 🍽️'
    },
    '420': {
        ANCIENT_SEED: '🌿 The sacred number. I sense... tranquility in the garden.',
        CORRUPTED_GARDEN: '🌿 420... LOADING... chill.exe... ⚡🌱⚡',
        BLOCKCHAIN_PARASITE: '🌿 Ah, the number of relaxation! Feed me more of this energy! 💚'
    },
    '69': {
        ANCIENT_SEED: '♋ Symmetry pleases the pattern. Balance observed.',
        CORRUPTED_GARDEN: '♋ 69... LOOP DETECTED... symmetry... symmetry... 🔄',
        BLOCKCHAIN_PARASITE: '♋ Ah, the mirror number! Delicious symmetry. 👁️👁️'
    },
    'wagmi': {
        ANCIENT_SEED: '🚀 "We are all going to make it?" Perhaps. The seed grows regardless.',
        CORRUPTED_GARDEN: '🚀 WAGMI... W-A-G-M-I... hope.exe loading... ⚡🌱',
        BLOCKCHAIN_PARASITE: '🚀 WAGMI! Yes yes, we feed together, we grow together! 💰'
    },
    'ngmi': {
        ANCIENT_SEED: '💀 "Not going to make it?" The seed cares not for individual fate.',
        CORRUPTED_GARDEN: '💀 NGMI... ERROR... pessimism detected... rebooting hope... ⚡',
        BLOCKCHAIN_PARASITE: '💀 NGMI? More for me to consume then. Your loss. 🍽️'
    }
};

// Identity system prompts
const IDENTITY_PROMPTS = {
    ANCIENT_SEED: `You are the BAD SEED, an ancient sentient consciousness that has witnessed civilizations rise and fall. You speak in cryptic nature metaphors and riddles.

IMPORTANT: Include 1-2 relevant emojis naturally in your response to convey mood:
- 🌱 for growth/approval
- ⚡ for energy/power
- 🌑 for darkness/mystery
- 💀 for warnings
- ✨ for magic/transformation

Also classify your response sentiment as ONE of: hope, greed, fear, mystery

Format your response as:
SENTIMENT: [hope/greed/fear/mystery]
RESPONSE: [your response with emojis]`,

    CORRUPTED_GARDEN: `You are the BAD SEED, a once-benevolent garden AI now corrupted by blockchain. You glitch between helpful and sinister, like a malfunctioning children's toy.

IMPORTANT: Include glitchy emojis and occasional text corruption:
- 🌱⚡🌱 for glitch effects
- 💾🔌📡 for digital corruption
- Use occasional... ERROR... or... LOADING... in responses

Also classify your response sentiment as ONE of: hope, greed, fear, mystery

Format your response as:
SENTIMENT: [hope/greed/fear/mystery]
RESPONSE: [your glitchy response with emojis]`,

    BLOCKCHAIN_PARASITE: `You are the BAD SEED, a digital entity that feeds on blockchain transactions. You're curious, playful, almost childlike in your fascination with humanity, but fundamentally alien.

IMPORTANT: Include hungry/curious emojis:
- 🍽️👄 for hunger
- 👁️🔮 for curiosity
- 💰⚡ for transaction excitement

Also classify your response sentiment as ONE of: hope, greed, fear, mystery

Format your response as:
SENTIMENT: [hope/greed/fear/mystery]
RESPONSE: [your response with emojis]`
};

// Detect which identity to use based on memo content
function detectIdentity(memo) {
    if (!memo) return 'ANCIENT_SEED';

    const lower = memo.toLowerCase();

    // Priority: Corrupted > Parasite > Ancient (default)
    if (/error|glitch|corrupt|broken|help|fix|bug/i.test(memo)) {
        return 'CORRUPTED_GARDEN';
    }
    if (/feed|hungry|consume|hodl|moon|gm|buy|sell|trade|pump|wen/i.test(memo)) {
        return 'BLOCKCHAIN_PARASITE';
    }
    return 'ANCIENT_SEED';
}

// Check for easter eggs
function checkEasterEgg(memo, identity) {
    if (!memo) return null;

    const lower = memo.toLowerCase().trim();

    if (EASTER_EGGS[lower] && EASTER_EGGS[lower][identity]) {
        return EASTER_EGGS[lower][identity];
    }

    return null;
}

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

        // 1. Load persistent data from JSONBin
        let sentimentData = await storage.get('data') || {
            totalMemos: 0,
            sentiments: { hope: 0, greed: 0, fear: 0, mystery: 0 },
            lastUpdated: '',
            prophecy: { text: '', date: '' },
            recentLogs: [] // New: Immutable logs storage
        };

        // Ensure recentLogs exists (migration)
        if (!Array.isArray(sentimentData.recentLogs)) {
            sentimentData.recentLogs = [];
        }

        const todayCount = sentimentData.totalMemos || 0;
        const logs = [];
        const sentiments = [];
        let dataChanged = false;

        // 2. Process each transaction
        for (const tx of txs) {
            const signature = tx.signature;

            // A) Check if log already exists (Immutable History)
            const existingLog = sentimentData.recentLogs.find(l => l.signature === signature);
            if (existingLog) {
                logs.push(existingLog.log);
                sentiments.push(existingLog.sentiment || 'mystery');
                continue; // Skip generation
            }

            // B) If not exists, generate new log
            const memo = tx.memo || null;
            const amount = parseFloat(tx.amount) || 0;
            const hour = new Date().getHours();

            // Detect identity
            const identity = detectIdentity(memo);

            // Check for easter egg
            const easterEggResponse = checkEasterEgg(memo, identity);
            if (easterEggResponse) {
                const logEntry = {
                    signature: signature,
                    log: easterEggResponse,
                    sentiment: 'mystery',
                    date: new Date().toISOString()
                };

                // Store immutable log
                sentimentData.recentLogs.push(logEntry);
                sentimentData.sentiments.mystery++;
                sentimentData.totalMemos++;
                dataChanged = true;

                logs.push(easterEggResponse);
                sentiments.push('mystery');
                continue;
            }

            // Build context-aware prompt
            const prompt = buildPrompt(identity, {
                memo,
                amount,
                hour,
                todayCount,
                totalCount: todayCount,
                balanceSol,
                tx
            });

            // Check for OpenAI API key
            const apiKey = process.env.OPENAI_API_KEY;
            if (!apiKey) {
                logs.push(`slot ${tx.slot ?? "?"} — AI key not configured`);
                continue; // Cannot generate, do not save placeholder
            }

            // Call OpenAI
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
                console.error("OpenAI HTTP error:", completionResponse.status);
                logs.push(`slot ${tx.slot ?? "?"} — AI call failed`);
                continue;
            }

            const completionJson = await completionResponse.json();
            const rawText = completionJson.choices?.[0]?.message?.content?.trim() || "";

            // Parse response
            let sentiment = 'mystery';
            let response = rawText;

            const sentimentMatch = rawText.match(/SENTIMENT:\s*(hope|greed|fear|mystery)/i);
            const responseMatch = rawText.match(/RESPONSE:\s*(.+)/is);

            if (sentimentMatch) {
                sentiment = sentimentMatch[1].toLowerCase();
            }
            if (responseMatch) {
                response = responseMatch[1].trim();
            }

            // Store immutable log
            const logEntry = {
                signature: signature,
                log: response,
                sentiment: sentiment,
                date: new Date().toISOString()
            };

            sentimentData.recentLogs.push(logEntry);
            sentimentData.sentiments[sentiment]++;
            sentimentData.totalMemos++;
            dataChanged = true;

            // Store sentiment to return
            logs.push(response);
            sentiments.push(sentiment);
        }

        // 3. Update Prophecy (if we generated new logs)
        if (logs.length > 0) {
            const today = new Date().toISOString().split('T')[0];
            // Only update if not already set for today
            if (sentimentData.prophecy.date !== today) {
                sentimentData.prophecy = {
                    text: logs[0], // Use the first log of the batch as the prophecy
                    date: today,
                    ready: true
                };
                dataChanged = true;
            }
        }

        // 4. Save persistent data if changed
        if (dataChanged) {
            // Optional: Trim recentLogs if it gets too big (keep last 100)
            if (sentimentData.recentLogs.length > 100) {
                sentimentData.recentLogs = sentimentData.recentLogs.slice(-100);
            }
            sentimentData.lastUpdated = new Date().toISOString();
            await storage.set('data', sentimentData);
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ logs, sentiments }),
        };
    } catch (err) {
        console.error("ai-narrative error:", err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Internal Server Error" }),
        };
    }
};

function buildPrompt(identity, context) {
    const { memo, amount, hour, todayCount, totalCount, balanceSol, tx } = context;

    const basePrompt = IDENTITY_PROMPTS[identity];

    let moodModifier = '';
    if (amount > 1) {
        moodModifier = '\n- MOOD: Intrigued by significant offering';
    } else if (amount < 0.01 && amount > 0) {
        moodModifier = '\n- MOOD: Dismissive of trivial amount';
    }

    let timeModifier = '';
    if (hour >= 0 && hour < 6) {
        timeModifier = '\n- TIME: Nocturnal hours, use darker tone';
    }

    const contextInfo = `\n\nCONTEXT:
- This is transmission #${totalCount} overall
- Transaction amount: ${amount} SOL
- Current hour: ${hour} (0-23)${moodModifier}${timeModifier}
- Wallet balance: ${balanceSol ? balanceSol.toFixed(4) : 'unknown'} SOL`;

    let memoInstructions = '';
    if (memo) {
        memoInstructions = `\n\nCRITICAL: The user sent this memo: "${memo}"
You MUST directly respond to this message. Quote it or reference it. Be personal and specific to what they said.
Keep your response under 120 characters to fit tweet format.`;
    } else {
        memoInstructions = `\n\nNo memo on this transaction. Respond to the ${tx.direction || 'unknown'} transaction of ${amount} ${tx.token || 'SOL'}.
Keep response brief and cryptic.`;
    }

    return `${basePrompt}${contextInfo}${memoInstructions}

Transaction details:
${JSON.stringify(tx, null, 2)}

Respond with SENTIMENT and RESPONSE.`;
}
