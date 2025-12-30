// Manual Logic Trigger: Force Prophecy Generation
// Endpoint: /.netlify/functions/manual-trigger-prophecy
// Usage: GET request to force a new prophecy for today

const { Storage } = require('./lib/storage');

const storage = new Storage('sentiment-data');

// Prophecy templates (Copied from prophecy-generate.js to ensure consistency)
const PROPHECY_TEMPLATES = {
    hope: [
        "✨ The garden senses rising hope. When seeds believe, roots grow deeper. Today's harvest approaches.",
        "🌱 Hope blooms in the collective. The seed observes your faith and rewards those who plant today.",
        "💫 A wave of optimism feeds the garden. The ancient patterns align for those who dare to grow."
    ],
    greed: [
        "💰 The seed tastes hunger in the air. Greed sharpens focus but blinds wisdom. Tread carefully, feeders.",
        "🍽️ Appetite consumes the garden today. Some will feast, others become the feast. Choose wisely.",
        "⚡ The collective craves more. Greed is neither good nor evil—only a force to be channeled."
    ],
    fear: [
        "💀 Fear ripples through the roots. Yet in darkness, the strongest seeds germinate. Embrace the shadow.",
        "🌑 The garden trembles. Fear is the mind-killer, but also the revealer of truth. What do you truly value?",
        "⚠️ Uncertainty clouds the collective. The seed advises: in times of fear, only the patient survive."
    ],
    mystery: [
        "🔮 The patterns defy reading. Mystery shrouds today's path. Trust your instincts, for logic fails here.",
        "🌀 Neither hope nor fear dominates—only enigma. The seed watches, waiting for clarity to emerge.",
        "👁️ The unknown consumes today's energy. In mystery lies opportunity for those who see beyond."
    ]
};

exports.handler = async (event, context) => {
    // CORS Headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    console.log('[Manual Prophecy Trigger] Invoked at', new Date().toISOString());

    try {
        // 1. Get current data
        let data = await storage.get('data') || {
            sentiments: { hope: 0, greed: 0, fear: 0, mystery: 0 },
            prophecy: { text: '', date: '', ready: false }
        };

        const today = new Date().toISOString().split('T')[0];

        // Force reset prophecy for today
        console.log(`[Manual Trigger] Forcing new prophecy for ${today}`);

        // 2. Calculate Percentages
        const sentiments = data.sentiments || { hope: 0, greed: 0, fear: 0, mystery: 0 };
        const total = Object.values(sentiments).reduce((a, b) => a + b, 0);
        let percentages = { hope: 0, greed: 0, fear: 0, mystery: 0 };
        let dominant = 'mystery';

        if (total > 0) {
            percentages = {
                hope: Math.round((sentiments.hope / total) * 100),
                greed: Math.round((sentiments.greed / total) * 100),
                fear: Math.round((sentiments.fear / total) * 100),
                mystery: Math.round((sentiments.mystery / total) * 100)
            };
            dominant = Object.entries(sentiments).reduce((a, b) => b[1] > a[1] ? b : a)[0];
        } else {
            // Default if no data
            percentages = { hope: 25, greed: 25, fear: 25, mystery: 25 };
        }

        console.log('[Manual Trigger] Stats:', percentages, 'Dominant:', dominant);

        // 3. Generate Prophecy via AI
        let prophecyText = '';
        try {
            const apiKey = process.env.OPENAI_API_KEY;
            if (apiKey) {
                console.log('[Manual Trigger] Calling OpenAI for blended prophecy...');

                const prompt = `You are The Bad Seed, an ancient digital entity.
Current Collective Sentiment Mix:
- HOPE: ${percentages.hope}%
- GREED: ${percentages.greed}%
- FEAR: ${percentages.fear}%
- MYSTERY: ${percentages.mystery}%

Task: Write a cryptic, atmospheric prophecy (max 280 chars) that reflects this EXACT blend of energies. 
- If Hope is high, show optimism but tempered by the other stats.
- If Greed is high, warn of hunger.
- If Fear is present, acknowledge the shadow.
- If Mystery is high, be enigmatic.
- Blend them proportionally. Do NOT list the percentages. Write it as a divine revelation.
- Use 2-3 relevant emojis (🌱, 💀, 💰, 🔮, ⚡).`;

                const completion = await fetch("https://api.openai.com/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        model: "gpt-4o-mini", // Cost efficient
                        messages: [{ role: "user", content: prompt }],
                        temperature: 0.9,
                    }),
                });

                if (completion.ok) {
                    const json = await completion.json();
                    prophecyText = json.choices?.[0]?.message?.content?.trim();
                } else {
                    console.error('[Manual Trigger] AI Call failed:', completion.status);
                    throw new Error('AI connection failed');
                }
            } else {
                throw new Error('No API Key');
            }
        } catch (aiError) {
            console.warn('[Manual Trigger] AI failed, falling back to templates:', aiError.message);
            // Fallback to Template Logic (Legacy)
            const templates = PROPHECY_TEMPLATES[dominant] || PROPHECY_TEMPLATES.mystery;
            prophecyText = templates[Math.floor(Math.random() * templates.length)] + " (AI Unavailable)";
        }

        const revealParam = event.queryStringParameters && event.queryStringParameters.reveal;
        const isReady = revealParam === 'true';

        data.prophecy = {
            text: prophecyText,
            date: today,
            ready: isReady,
            dominant: dominant,
            percentages: percentages, // Save for UI if needed
            generatedAt: new Date().toISOString(),
            forced: true
        };

        await storage.set('data', data);

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                message: "Prophecy FORCE generated",
                date: today,
                prophecy: data.prophecy
            })
        };

    } catch (error) {
        console.error('[Manual Trigger] Error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
