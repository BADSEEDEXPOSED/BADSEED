// Netlify Serverless Function: AI Narrative Generator for BAD SEED
// Endpoint: /.netlify/functions/ai-narrative
// Version: 3.0 - AI Personality Enhancement + Permanent Log Storage

const fs = require('fs');
const path = require('path');
const { Storage } = require('./lib/storage');

const SENTIMENT_DATA_FILE = path.join(__dirname, 'sentiment-data.json');
const aiLogsStorage = new Storage('ai-logs-data');

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

//Update sentiment data
// Update sentiment data via Storage (Redis)
async function updateSentiment(sentiment) {
    try {
        const storage = new Storage('sentiment-data');
        let data = await storage.get('data') || {
            totalMemos: 0,
            sentiments: { hope: 0, greed: 0, fear: 0, mystery: 0 },
            lastUpdated: '',
            prophecy: { text: '', date: '' }
        };

        // Update sentiment
        data.sentiments[sentiment]++;
        data.totalMemos++;
        data.lastUpdated = new Date().toISOString();

        // Save back to Redis
        await storage.set('data', data);
    } catch (error) {
        console.error('Error updating sentiment:', error);
    }
}

// Get sentiment data for context from Redis
async function getSentimentData() {
    try {
        const storage = new Storage('sentiment-data');
        const data = await storage.get('data');
        return data || {
            totalMemos: 0,
            sentiments: { hope: 0, greed: 0, fear: 0, mystery: 0 },
            lastUpdated: '',
            prophecy: { text: '', date: '' }
        };
    } catch (error) {
        console.error('Error reading sentiment data:', error);
        return {
            totalMemos: 0,
            sentiments: { hope: 0, greed: 0, fear: 0, mystery: 0 },
            lastUpdated: '',
            prophecy: { text: '', date: '' }
        };
    }
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

        // Get sentiment data for context
        const sentimentData = await getSentimentData();
        const todayCount = sentimentData.totalMemos || 0;

        // Process each transaction
        const logs = [];
        const sentiments = [];

        // Load stored logs from JSONBin
        let storedLogs = {};
        try {
            storedLogs = await aiLogsStorage.get('logs') || {};
        } catch (err) {
            console.log('Could not load stored logs:', err.message);
        }

        for (const tx of txs) {
            const signature = tx.signature || tx.slot?.toString() || null;
            const memo = tx.memo || null;
            const amount = parseFloat(tx.amount) || 0;
            const hour = new Date().getHours();

            // CHECK FOR STORED LOG FIRST (immutable - never regenerate)
            if (signature && storedLogs[signature]) {
                console.log(`[AI] Using stored log for ${signature}`);
                logs.push(storedLogs[signature].log);
                sentiments.push(storedLogs[signature].sentiment || 'mystery');
                continue;
            }

            // Detect identity
            const identity = detectIdentity(memo);

            // Check for easter egg
            const easterEggResponse = checkEasterEgg(memo, identity);
            if (easterEggResponse) {
                // Store easter egg response permanently
                if (signature) {
                    storedLogs[signature] = { log: easterEggResponse, sentiment: 'mystery', storedAt: new Date().toISOString() };
                }
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
                continue;
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

            // Store log permanently in JSONBin (immutable)
            if (signature) {
                storedLogs[signature] = { log: response, sentiment, storedAt: new Date().toISOString() };
            }
            logs.push(response);

            // ----------------------------------------------------------------
            // HEURISTIC SENTIMENT WEIGHTING
            // User Rules:
            // 1. Outgoing SOL -> Greed (some), Fear (little)
            // 2. Incoming SOL -> Hope (some) based on memo
            // 3. No Memo -> Mystery (little)
            // 4. Mystery sentiment increases if memo is not hopeful/fearful/greedy
            // ----------------------------------------------------------------

            // Start with the AI's core sentiment
            const txSentiments = [sentiment];

            // 1. Outgoing Transaction (Spending SOL)
            // "Greed some, Fear a little"
            if (amount < 0 || tx.direction === 'out') {
                txSentiments.push('greed', 'greed'); // +2 Greed
                txSentiments.push('fear');           // +1 Fear
            }

            // 2. Incoming Transaction (Receiving SOL)
            // "Hope some" (regardless of memo)
            else if (amount > 0 || tx.direction === 'in') {
                txSentiments.push('hope', 'hope');   // +2 Hope
            }

            // 3. Mystery Logic
            if (!memo) {
                // "Change a little if any transaction has no memo"
                txSentiments.push('mystery');        // +1 Mystery
            } else if (sentiment === 'mystery') {
                // "Change some if the memo is not hopeful or fearful or greedy"
                // AI already gave +1 Mystery, add another +1 for "some"
                txSentiments.push('mystery');
            }

            // Push ALL derived sentiments for this transaction
            sentiments.push(...txSentiments);
        }

        // Save all new logs to JSONBin
        try {
            await aiLogsStorage.set('logs', storedLogs);
            console.log('[AI] Saved logs to JSONBin');
        } catch (err) {
            console.error('[AI] Failed to save logs:', err.message);
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
