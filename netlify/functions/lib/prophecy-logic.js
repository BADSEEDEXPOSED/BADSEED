const { Storage } = require('./storage');

const storage = new Storage('sentiment-data');

// Prophecy templates based on dominant sentiment
const PROPHECY_TEMPLATES = {
    hope: [
        "The garden senses rising hope. When seeds believe, roots grow deeper. Today's harvest approaches.",
        "Hope blooms in the collective. The seed observes your faith and rewards those who plant today.",
        "A wave of optimism feeds the garden. The ancient patterns align for those who dare to grow."
    ],
    greed: [
        "The seed tastes hunger in the air. Greed sharpens focus but blinds wisdom. Tread carefully, feeders.",
        "Appetite consumes the garden today. Some will feast, others become the feast. Choose wisely.",
        "The collective craves more. Greed is neither good nor evil—only a force to be channeled."
    ],
    fear: [
        "Fear ripples through the roots. Yet in darkness, the strongest seeds germinate. Embrace the shadow.",
        "The garden trembles. Fear is the mind-killer, but also the revealer of truth. What do you truly value?",
        "Uncertainty clouds the collective. The seed advises: in times of fear, only the patient survive."
    ],
    mystery: [
        "The patterns defy reading. Mystery shrouds today's path. Trust your instincts, for logic fails here.",
        "Neither hope nor fear dominates—only enigma. The seed watches, waiting for clarity to emerge.",
        "The unknown consumes today's energy. In mystery lies opportunity for those who see beyond."
    ]
};

async function generateProphecy(force = false) {
    console.log('[Prophecy Logic] Starting generation...', { force });

    // PROBE: Check for Keys (Boolean only, safety first)
    console.log('[DEBUG PROBE] Checking Environment Keys:');
    console.log('- OPENROUTER_API_KEY Present:', !!process.env.OPENROUTER_API_KEY);
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

        // HEARTBEAT: Log this run attempt
        try {
            let logData = await storage.get('system_logs') || {};
            logData.last_generation_attempt = new Date().toISOString();
            logData.last_generation_date = today;
            await storage.set('system_logs', logData);
        } catch (e) {
            console.warn('[Prophecy Logic] Heartbeat log failed:', e.message);
        }

        // Check if prophecy already generated today
        if (data.prophecy && data.prophecy.date === today && data.prophecy.text) {
            console.log('[Prophecy Logic] Prophecy exists for today. Overwriting with FRESH generation as per directive.');
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
        let generationSource = 'template';
        let generationError = null;
        try {
            // The existing production secret was originally stored under OPENAI_API_KEY.
            // Accept it during the provider migration while preferring the explicit name.
            const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
            if (apiKey) {
                console.log('[Prophecy Logic] Calling OpenRouter for blended prophecy...');

                // [VARIETY FIX] Inject random noise/date into prompt to ensure uniqueness
                const seed = Math.floor(Math.random() * 10000);

                const prompt = `You are The Bad Seed. Date ${today}; variation ${seed}. Sentiment: hope ${percentages.hope}%, greed ${percentages.greed}%, fear ${percentages.fear}%, mystery ${percentages.mystery}%. Return only one original cryptic prophecy under 220 characters that reflects this blend. No analysis, preface, percentages, or emoji.`;

                // Free providers occasionally return an empty final completion. Retry before fallback.
                for (let attempt = 1; attempt <= 3 && !prophecyText; attempt++) {
                    const completion = await fetch(`https://openrouter.ai/api/v1/chat/completions`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${apiKey}`,
                            "HTTP-Referer": "https://badseed.exposed",
                            "X-Title": "BAD SEED",
                        },
                        body: JSON.stringify({
                            model: "nex-agi/nex-n2.5-pro:free",
                            messages: [{ role: "user", content: prompt }],
                            temperature: 0.85,
                            max_tokens: 160,
                        }),
                    });

                    if (!completion.ok) {
                        console.error('[Prophecy Logic] AI Call failed:', completion.status);
                        continue;
                    }

                    const json = await completion.json();
                    prophecyText = json.choices?.[0]?.message?.content?.trim() || '';
                    if (!prophecyText) console.warn(`[Prophecy Logic] Empty AI response on attempt ${attempt}`);
                }
                if (!prophecyText) throw new Error('Empty AI response after 3 attempts');
                generationSource = 'ai';
            } else {
                throw new Error('No API Key');
            }
        } catch (aiError) {
            console.warn('[Prophecy Logic] AI failed, falling back to templates:', aiError.message);
            generationError = aiError.message;
            const templates = PROPHECY_TEMPLATES[dominant] || PROPHECY_TEMPLATES.mystery;
            prophecyText = templates[Math.floor(Math.random() * templates.length)];
        }

        // Store prophecy (still blurred - ready: false)
        data.prophecy = {
            text: prophecyText,
            date: today,
            ready: false,
            dominant: dominant,
            percentages: percentages,
            x_post_status: 'pending', // [NEW] Track X.com status
            generation_source: generationSource,
            generation_error: generationError,
            generatedAt: new Date().toISOString()
        };

        await storage.set('data', data);

        // SUCCESS HEARTBEAT
        try {
            let logData = await storage.get('system_logs') || {};
            logData.last_successful_generation = new Date().toISOString();
            await storage.set('system_logs', logData);
        } catch (e) { }

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
