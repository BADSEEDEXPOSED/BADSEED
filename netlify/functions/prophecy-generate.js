// Scheduled Function: Generate Daily Prophecy
// Runs at 12:00 UTC daily - generates prophecy based on morning sentiment
// Prophecy remains blurred until 18:00 UTC reveal

const { Storage } = require('./lib/storage');

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

exports.handler = async (event, context) => {
    console.log('[Prophecy Generate] Running at', new Date().toISOString());

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
        if (data.prophecy && data.prophecy.date === today && data.prophecy.text) {
            console.log('[Prophecy Generate] Already generated for today');
            return { statusCode: 200, body: JSON.stringify({ message: 'Already generated' }) };
        }

        // Find dominant sentiment
        const sentiments = data.sentiments || { hope: 0, greed: 0, fear: 0, mystery: 0 };
        const total = Object.values(sentiments).reduce((a, b) => a + b, 0);

        let dominant = 'mystery';
        if (total > 0) {
            dominant = Object.entries(sentiments).reduce((a, b) => b[1] > a[1] ? b : a)[0];
        }

        // Select random prophecy from templates
        const templates = PROPHECY_TEMPLATES[dominant];
        const prophecyText = templates[Math.floor(Math.random() * templates.length)];

        // Store prophecy (still blurred - ready: false)
        data.prophecy = {
            text: prophecyText,
            date: today,
            ready: false,
            dominant: dominant,
            generatedAt: new Date().toISOString()
        };

        await storage.set('data', data);

        console.log('[Prophecy Generate] Generated:', dominant, prophecyText.substring(0, 50));

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                dominant,
                prophecy: prophecyText.substring(0, 50) + '...'
            })
        };
    } catch (error) {
        console.error('[Prophecy Generate] Error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

// Netlify scheduled function config
exports.config = {
    schedule: "0 12 * * *"  // 12:00 UTC daily
};
