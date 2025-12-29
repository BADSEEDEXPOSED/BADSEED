// Scheduled Function: Reveal and Post Prophecy
// Runs at 18:00 UTC daily - unblurs prophecy and posts to X.com

const { Storage } = require('./lib/storage');
const OAuth = require('oauth-1.0a');
const crypto = require('crypto');

const storage = new Storage('sentiment-data');

const { generateProphecy } = require('./lib/prophecy-logic'); // Import logic

exports.handler = async (event, context) => {
    console.log('[Prophecy Reveal] Running at', new Date().toISOString());

    try {
        // Get current data
        let storageData = await storage.get('data');

        // SELF-HEALING: If no data or prophecy for today, GENERATE IT NOW
        const today = new Date().toISOString().split('T')[0];

        if (!storageData || !storageData.prophecy || storageData.prophecy.date !== today) {
            console.log('[Prophecy Reveal] ⚠️ Missing prophecy for today. TRIGGERING SELF-HEALING generation...');

            // Force generation (even if stats are stale, we need a prophecy)
            const genResult = await generateProphecy(true); // force = true

            // USE RETURNED DATA directly to avoid Storage cache race condition (TTL 5s)
            if (genResult.success && genResult.prophecy) {
                if (!storageData) storageData = {};
                storageData.prophecy = genResult.prophecy;
                console.log('[Prophecy Reveal] Self-Healing Complete. Prophecy generated.');
            } else {
                // Fallback refresh just in case
                storageData = await storage.get('data');
            }
        }

        let data = storageData || {
            totalMemos: 0,
            sentiments: { hope: 0, greed: 0, fear: 0, mystery: 0 },
            prophecy: { text: '', date: '', ready: false }
        };

        const prophecy = data.prophecy || {};
        const todayString = new Date().toISOString().split('T')[0];

        // Double check existence (should be there now)
        if (!prophecy.text || prophecy.date !== todayString) {
            console.log('[Prophecy Reveal] ❌ Critical: Failed to generate prophecy even after self-healing.');
            return { statusCode: 500, body: JSON.stringify({ error: 'Failed to generate prophecy' }) };
        }

        if (prophecy.ready) {
            console.log('[Prophecy Reveal] Already revealed');
            return { statusCode: 200, body: JSON.stringify({ message: 'Already revealed' }) };
        }

        // Mark as ready (unblurred)
        data.prophecy.ready = true;
        if (!data.prophecy.revealedAt) {
            data.prophecy.revealedAt = new Date().toISOString();
        }

        // Ensure x_post_status is at least pending if unknown
        if (!data.prophecy.x_post_status) {
            data.prophecy.x_post_status = 'pending';
        }

        // RESET MYSTERY SENTIMENT (The "Reset" Rule)
        if (data.sentiments) {
            data.sentiments.mystery = 0;
            console.log('[Prophecy Reveal] Mystery sentiment reset to 0');
        }

        await storage.set('data', data);

        console.log('[Prophecy Reveal] Prophecy unblurred');

        // Post to X.com
        const tweetText = `🔮 BADSEED DAILY PROPHECY 🔮\n\n${prophecy.text}\n\n📊 Dominant energy: ${prophecy.dominant?.toUpperCase() || 'MYSTERY'}\n\n#BADSEED #Solana #Crypto`;

        try {
            const postResult = await postToX(tweetText);
            console.log('[Prophecy Reveal] Posted to X:', postResult);

            data.prophecy.postedAt = new Date().toISOString();
            data.prophecy.tweetId = postResult.id;
            data.prophecy.x_post_status = 'posted'; // [NEW] Success
            await storage.set('data', data);
        } catch (postError) {
            console.error('[Prophecy Reveal] Failed to post:', postError.message);
            data.prophecy.x_post_status = 'failed'; // [NEW] Failure
            await storage.set('data', data); // Save the failure status
            // Don't fail the whole function, prophecy is still revealed
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                revealed: true,
                prophecy: prophecy.text
            })
        };
    } catch (error) {
        console.error('[Prophecy Reveal] Error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

async function postToX(text) {
    const consumer_key = process.env.X_CONSUMER_KEY;
    const consumer_secret = process.env.X_CONSUMER_SECRET;
    const access_token = process.env.X_ACCESS_TOKEN;
    const access_token_secret = process.env.X_ACCESS_SECRET;

    if (!consumer_key || !consumer_secret || !access_token || !access_token_secret) {
        throw new Error('Missing X API credentials');
    }

    const oauth = OAuth({
        consumer: { key: consumer_key, secret: consumer_secret },
        signature_method: 'HMAC-SHA1',
        hash_function(base_string, key) {
            return crypto.createHmac('sha1', key).update(base_string).digest('base64');
        },
    });

    const request_data = {
        url: 'https://api.twitter.com/2/tweets',
        method: 'POST',
    };

    const token = { key: access_token, secret: access_token_secret };
    const authHeader = oauth.toHeader(oauth.authorize(request_data, token));

    const response = await fetch(request_data.url, {
        method: 'POST',
        headers: {
            ...authHeader,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`X API Error ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    return result.data;
}

// Netlify scheduled function config
exports.config = {
    schedule: "0 18 * * *"  // 18:00 UTC daily
};
