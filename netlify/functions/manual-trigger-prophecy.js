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
        const { generateProphecy } = require('./lib/prophecy-logic'); // Import shared logic
        const { Storage } = require('./lib/storage');
        const storage = new Storage('sentiment-data');

        // Check for 'reveal' override
        // Default: FALSE (Blurred)
        const revealParam = event.queryStringParameters && event.queryStringParameters.reveal;
        const forceReady = revealParam === 'true';

        // FORCE GENERATION (force=true)
        const result = await generateProphecy(true);

        // If specific override requested, apply it to the saved data
        if (forceReady) {
            let data = await storage.get('data');
            if (data && data.prophecy) {
                data.prophecy.ready = true;
                data.prophecy.forced_ready = true;
                await storage.set('data', data);
                result.prophecy.ready = true; // Update return value too
            }
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: "Prophecy FORCE generated",
                date: result.prophecy.date,
                prophecy: result.prophecy
            })
        };

    } catch (error) {
        console.error('[Manual Trigger] Error:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) }; // Include headers for CORS
    }
};
