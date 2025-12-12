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

        const sentiments = data.sentiments || { hope: 0, greed: 0, fear: 0, mystery: 0 };
        const total = Object.values(sentiments).reduce((a, b) => a + b, 0);

        let dominant = 'mystery';
        if (total > 0) {
            dominant = Object.entries(sentiments).reduce((a, b) => b[1] > a[1] ? b : a)[0];
        }

        const templates = PROPHECY_TEMPLATES[dominant];
        const prophecyText = templates[Math.floor(Math.random() * templates.length)];

        const revealParam = event.queryStringParameters && event.queryStringParameters.reveal;
        const isReady = revealParam === 'true';

        data.prophecy = {
            text: prophecyText,
            date: today,
            ready: isReady, // Default to false (Blurred) for manual override unless ?reveal=true
            dominant: dominant,
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
