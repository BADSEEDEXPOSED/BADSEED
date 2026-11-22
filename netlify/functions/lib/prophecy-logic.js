const { Storage } = require('./storage');

const storage = new Storage('sentiment-data');

// Prophecy templates (last-resort fallback if every AI model is unreachable)
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

function cleanProphecyText(raw) {
    if (!raw || typeof raw !== 'string') return '';
    let text = raw
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/^["'`\s]+|["'`\s]+$/g, '')
        .replace(/^(?:prophecy|response|oracle)\s*:\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (text.length > 200) {
        text = text.slice(0, 197).replace(/\s+\S*$/, '').trim() + '...';
    }
    return text.length >= 20 ? text : '';
}

async function callGrok(apiKey, prompt) {
    const models = ['grok-3-mini', 'grok-3'];
    let lastError = 'No xAI Grok models succeeded';
    for (const model of models) {
        try {
            const completion = await fetch('https://api.x.ai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                signal: AbortSignal.timeout(15000),
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: 'system', content: 'You are SEED, an ancient digital entity. Reply with ONLY one original, cryptic prophecy (under 170 characters) written as a divine revelation. Include 2-3 relevant emojis (🌱, 💀, 💰, 🔮, ⚡). No preface, no quotes, no dates, no numbers, no percentages, no hashtags.' },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.9,
                    max_tokens: 140,
                }),
            });
            if (!completion.ok) {
                lastError = `xAI ${model} HTTP ${completion.status}`;
                continue;
            }
            const json = await completion.json();
            const cleaned = cleanProphecyText(json.choices?.[0]?.message?.content);
            if (cleaned) return { text: cleaned, model };
            lastError = `xAI ${model} empty completion`;
        } catch (err) {
            lastError = `xAI ${model}: ${err.message}`;
        }
    }
    throw new Error(lastError);
}

async function callOpenRouter(apiKey, prompt) {
    const models = [
        process.env.OPENROUTER_MODEL,
        'openrouter/free',
        'meta-llama/llama-3.3-70b-instruct:free',
        'google/gemma-3-27b-it:free',
        'nex-agi/nex-n2.5-pro:free'
    ].filter(Boolean);

    let lastError = 'No OpenRouter models succeeded';
    for (const model of [...new Set(models)]) {
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const completion = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                        'HTTP-Referer': 'https://badseed.exposed',
                        'X-Title': 'BAD SEED',
                    },
                    signal: AbortSignal.timeout(15000),
                    body: JSON.stringify({
                        model,
                        messages: [
                            { role: 'system', content: 'You are SEED, an ancient digital entity. Reply with ONLY one original, cryptic prophecy (under 170 characters) written as a divine revelation. Include 2-3 relevant emojis (🌱, 💀, 💰, 🔮, ⚡). No preface, no quotes, no dates, no numbers, no percentages, no hashtags.' },
                            { role: 'user', content: prompt }
                        ],
                        reasoning: { exclude: true },
                        temperature: 0.9,
                        max_tokens: 220,
                    }),
                });
                if (!completion.ok) {
                    lastError = `OpenRouter ${model} HTTP ${completion.status}`;
                    if (completion.status !== 429 && completion.status < 500) break;
                    continue;
                }
                const json = await completion.json();
                const cleaned = cleanProphecyText(json.choices?.[0]?.message?.content);
                if (cleaned) return { text: cleaned, model };
                lastError = `OpenRouter ${model} empty completion`;
            } catch (err) {
                lastError = `OpenRouter ${model}: ${err.message}`;
            }
        }
    }
    throw new Error(lastError);
}

async function callOpenAI(apiKey, prompt) {
    const completion = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: 'You are SEED, an ancient digital entity. Reply with ONLY one original, cryptic prophecy (under 170 characters) written as a divine revelation. Include 2-3 relevant emojis (🌱, 💀, 💰, 🔮, ⚡). No preface, no quotes, no dates, no numbers, no percentages, no hashtags.' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.9,
            max_tokens: 140,
        }),
    });
    if (!completion.ok) throw new Error(`OpenAI HTTP ${completion.status}`);
    const json = await completion.json();
    const cleaned = cleanProphecyText(json.choices?.[0]?.message?.content);
    if (!cleaned) throw new Error('OpenAI returned empty completion');
    return { text: cleaned, model: 'gpt-4o-mini' };
}

async function generateProphecy(force = false) {
    console.log('[Prophecy Logic] Starting generation...', { force });

    try {
        let data = await storage.get('data') || {
            totalMemos: 0,
            sentiments: { hope: 0, greed: 0, fear: 0, mystery: 0 },
            lastUpdated: '',
            prophecy: { text: '', date: '', ready: false }
        };

        const today = new Date().toISOString().split('T')[0];

        // If not forced and today's prophecy was already posted to X, don't overwrite it!
        if (!force && data.prophecy && data.prophecy.date === today && data.prophecy.x_post_status === 'posted') {
            return { success: true, skipped: true, message: 'Already generated and posted today', dominant: data.prophecy.dominant, prophecy: data.prophecy };
        }

        try {
            let logData = await storage.get('system_logs') || {};
            logData.last_generation_attempt = new Date().toISOString();
            logData.last_generation_date = today;
            await storage.set('system_logs', logData);
        } catch (e) { }

        const sentiments = data.sentiments || { hope: 0, greed: 0, fear: 0, mystery: 0 };
        const total = Object.values(sentiments).reduce((a, b) => a + b, 0);

        let dominant = 'mystery';
        if (total > 0) {
            dominant = Object.entries(sentiments).reduce((a, b) => b[1] > a[1] ? b : a)[0];
        }

        let percentages = { hope: 25, greed: 25, fear: 25, mystery: 25 };
        if (total > 0) {
            percentages = {
                hope: Math.round((sentiments.hope / total) * 100),
                greed: Math.round((sentiments.greed / total) * 100),
                fear: Math.round((sentiments.fear / total) * 100),
                mystery: Math.round((sentiments.mystery / total) * 100)
            };
        }

        let prophecyText = '';
        let generationSource = 'template';
        let generationModel = null;
        let generationError = null;

        const prompt = `Date ${today}. Dominant energy: ${dominant} (hope ${percentages.hope}%, greed ${percentages.greed}%, fear ${percentages.fear}%, mystery ${percentages.mystery}%). Speak today's prophecy without mentioning dates, numbers, or percentages.`;

        const xaiKey = process.env.XAI_API_KEY;
        const openRouterKey = process.env.OPENROUTER_API_KEY || (process.env.OPENAI_API_KEY?.startsWith('sk-or-') ? process.env.OPENAI_API_KEY : null);
        const openAiKey = process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.startsWith('sk-or-') ? process.env.OPENAI_API_KEY : null;

        if (xaiKey) {
            try {
                const res = await callGrok(xaiKey, prompt);
                prophecyText = res.text;
                generationSource = 'ai';
                generationModel = res.model;
            } catch (err) {
                console.warn('[Prophecy Logic] xAI Grok failed:', err.message);
                generationError = err.message;
            }
        }

        if (!prophecyText && openRouterKey) {
            try {
                const res = await callOpenRouter(openRouterKey, prompt);
                prophecyText = res.text;
                generationSource = 'ai';
                generationModel = res.model;
                generationError = null;
            } catch (err) {
                console.warn('[Prophecy Logic] OpenRouter chain failed:', err.message);
                generationError = (generationError ? generationError + '; ' : '') + err.message;
            }
        }

        if (!prophecyText && openAiKey) {
            try {
                const res = await callOpenAI(openAiKey, prompt);
                prophecyText = res.text;
                generationSource = 'ai';
                generationModel = res.model;
                generationError = null;
            } catch (err) {
                console.warn('[Prophecy Logic] OpenAI fallback failed:', err.message);
                generationError = (generationError ? generationError + '; ' : '') + err.message;
            }
        }

        if (!prophecyText) {
            const templates = PROPHECY_TEMPLATES[dominant] || PROPHECY_TEMPLATES.mystery;
            prophecyText = templates[Math.floor(Math.random() * templates.length)];
        }

        data.prophecy = {
            text: prophecyText,
            date: today,
            ready: false,
            dominant,
            percentages,
            x_post_status: 'pending',
            generation_source: generationSource,
            generation_model: generationModel,
            generation_error: generationError,
            generatedAt: new Date().toISOString()
        };

        await storage.set('data', data);

        try {
            let logData = await storage.get('system_logs') || {};
            logData.last_successful_generation = new Date().toISOString();
            await storage.set('system_logs', logData);
        } catch (e) { }

        console.log('[Prophecy Logic] Generated:', dominant, generationSource, generationModel, prophecyText.substring(0, 60));

        return { success: true, dominant, prophecy: data.prophecy };
    } catch (error) {
        console.error('[Prophecy Logic] Error:', error);
        try {
            let errorData = await storage.get('data') || {};
            errorData.system_status = 'error';
            errorData.last_error = error.message;
            errorData.last_error_time = new Date().toISOString();
            await storage.set('data', errorData);
        } catch (dbError) { }
        throw error;
    }
}

module.exports = { generateProphecy };
