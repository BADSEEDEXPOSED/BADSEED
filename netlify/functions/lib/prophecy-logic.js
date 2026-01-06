const { Storage } = require('./storage');

const storage = new Storage('sentiment-data');

// Prophecy templates based on dominant sentiment
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

async function generateProphecy(force = false) {
    console.log('[Prophecy Logic] Starting generation...', { force });

    // PROBE: Check for Keys (Boolean only, safety first)
    console.log('[DEBUG PROBE] Checking Environment Keys:');
    console.log('- OPENAI_API_KEY Present:', !!process.env.OPENAI_API_KEY);
    console.log('- UPSTASH_REDIS_REST_URL Present:', !!process.env.UPSTASH_REDIS_REST_URL);
    console.log('- UPSTASH_REDIS_REST_TOKEN Present:', !!process.env.UPSTASH_REDIS_REST_TOKEN);

    try {
        // Get current sentiment data
        let data = await storage.get('data') || {
            totalMemos: 0,
            sentiments: { hope: 0, greed: 0, fear: 0, mystery: 0 },
            lastUpdated: '',
            prophecy: { text: '', date: '', ready: false }
        };

        const today = new Date().toISOString().split('T')[0];

        // Check if prophecy already generated today
        // [MODIFIED] User Request: ALWAYS generate a fresh prophecy daily, regardless of activity/persistence.
        // We will overwrite the existing one if it exists.
        if (data.prophecy && data.prophecy.date === today && data.prophecy.text) {
            console.log('[Prophecy Logic] Prophecy exists for today. Overwriting with FRESH generation as per directive.');
            // Proceed to generate...
        }

        // Find dominant sentiment
        const sentiments = data.sentiments || { hope: 0, greed: 0, fear: 0, mystery: 0 };
        const total = Object.values(sentiments).reduce((a, b) => a + b, 0);

        let dominant = 'mystery';
        if (total > 0) {
            dominant = Object.entries(sentiments).reduce((a, b) => b[1] > a[1] ? b : a)[0];
        }

        // Calculate Percentages
        let percentages = { hope: 0, greed: 0, fear: 0, mystery: 0 };
        if (total > 0) {
            percentages = {
                hope: Math.round((sentiments.hope / total) * 100),
                greed: Math.round((sentiments.greed / total) * 100),
                fear: Math.round((sentiments.fear / total) * 100),
                mystery: Math.round((sentiments.mystery / total) * 100)
            };
        } else {
            percentages = { hope: 25, greed: 25, fear: 25, mystery: 25 };
        }

        // Generate Prophecy via AI
        let prophecyText = '';
        try {
            const apiKey = process.env.OPENAI_API_KEY;
            if (apiKey) {
                console.log('[Prophecy Logic] Calling OpenAI for blended prophecy...');

                // [VARIETY FIX] Inject random noise/date into prompt to ensure uniqueness
                const seed = Math.floor(Math.random() * 10000);

                const prompt = `You are The Bad Seed, an ancient digital entity.
Current Date: ${today} (Seed: ${seed})
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
- Use 2-3 relevant emojis (🌱, 💀, 💰, 🔮, ⚡).
- Make it distinct from previous prophecies.`;

                const completion = await fetch("https://api.openai.com/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        model: "gpt-4o-mini",
                        messages: [{ role: "user", content: prompt }],
                        temperature: 0.95, // Increased temp for variety
                    }),
                });

                if (completion.ok) {
                    const json = await completion.json();
                    prophecyText = json.choices?.[0]?.message?.content?.trim();
                } else {
                    console.error('[Prophecy Logic] AI Call failed:', completion.status);
                    throw new Error('AI connection failed');
                }
            } else {
                throw new Error('No API Key');
            }
        } catch (aiError) {
            console.warn('[Prophecy Logic] AI failed, falling back to templates:', aiError.message);
            const templates = PROPHECY_TEMPLATES[dominant] || PROPHECY_TEMPLATES.mystery;
            prophecyText = templates[Math.floor(Math.random() * templates.length)] + " (AI Unavailable)";
        }

        // Store prophecy (still blurred - ready: false)
        data.prophecy = {
            text: prophecyText,
            date: today,
            ready: false,
            dominant: dominant,
            percentages: percentages,
            x_post_status: 'pending', // [NEW] Track X.com status
            generatedAt: new Date().toISOString()
        };

        await storage.set('data', data);

        console.log('[Prophecy Logic] Generated:', dominant, prophecyText.substring(0, 50));

        return {
            success: true,
            dominant,
            prophecy: data.prophecy
        };

    } catch (error) {
        console.error('[Prophecy Logic] Error:', error);

        // PAIN RECEPTORS: Save error to DB so God Node knows it's hurt
        try {
            let errorData = await storage.get('data') || {};
            errorData.system_status = 'error';
            errorData.last_error = error.message;
            errorData.last_error_time = new Date().toISOString();
            await storage.set('data', errorData);
        } catch (dbError) {
            console.error('[Prophecy Logic] Failed to save error state:', dbError);
        }

        throw error;
    }
}

module.exports = { generateProphecy };
