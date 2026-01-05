// Scheduled Function: Process X.com Queue
// Runs at 00:00 and 12:00 UTC daily
// Compiles queued memos into a single digest tweet and posts it.

const OAuth = require('oauth-1.0a');
const crypto = require('crypto');
const { Storage } = require('./lib/storage');

const storage = new Storage('queue-data');

exports.handler = async (event, context) => {
    console.log('[Queue Processor] Running at', new Date().toISOString());

    try {
        // 0. Check Pause Status
        const controlStorage = new Storage('queue-control');
        const status = await controlStorage.get('status');
        if (status && status.paused) {
            console.log('[Queue Processor] SKIPPED: Queue is paused.');
            return { statusCode: 200, body: 'Queue paused' };
        }

        // 1. Get Queue
        let queue = await storage.get('queue') || [];

        if (queue.length === 0) {
            console.log('[Queue Processor] Queue empty. Nothing to post.');
            return { statusCode: 200, body: 'Queue empty' };
        }

        // 2. Format Tweet
        const tweetText = formatTweet(queue);
        console.log('[Queue Processor] Formatted Tweet:', tweetText);

        // 3. Post to X
        const postResult = await postToX(tweetText);
        const tweetId = postResult.data ? postResult.data.id : "unknown";
        console.log('[Queue Processor] Post Success:', tweetId);

        // 4. Archive & Clear
        let history = await storage.get('posted-history') || [];
        queue.forEach(item => {
            if (item.memo && !history.includes(item.memo)) {
                history.push(item.memo);
            }
        });
        // Keep history sane
        if (history.length > 200) history = history.slice(-100);

        await storage.set('posted-history', history);
        await storage.set('queue', []); // Clear processed items

        // 5. UPDATE TRANSMISSION LOG
        const logStorage = new Storage('transmission-log');
        let logs = await logStorage.get('logs') || [];
        logs.unshift({
            id: tweetId, // Fixed ID access
            text: tweetText,
            date: new Date().toISOString(),
            type: "AUTO_DIGEST",
            link: `https://x.com/i/status/${tweetId}`
        });
        if (logs.length > 50) logs.pop();
        await logStorage.set('logs', logs);

        console.log('[Queue Processor] Queue cleared and Transmission Log updated.');

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, tweetId: tweetId })
        };

    } catch (error) {
        console.error('[Queue Processor] Error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

// Helper: Format Tweet (Ported from xPosting.js)
function formatTweet(items) {
    const maxLen = 280;
    const header = "🌱 BADSEED TRANSMISSION LOG 🌱\n\n";
    let body = "";

    // Sort logic? Oldest first? 
    // Usually FIFO is best for logs. items[0] is oldest if push/push? 
    // Assuming queue is array of objects {memo, aiLog}

    for (const item of items) {
        const { memo, aiLog } = item;
        const line = `📨 "${memo}"\n→ ${aiLog}\n\n`;
        const remaining = maxLen - header.length - body.length;

        if (remaining <= 0) break;
        if (line.length > remaining) {
            // Truncate logic
            const truncated = line.slice(0, remaining - 2) + "…";
            body += truncated;
            break;
        }
        body += line;
    }
    return (header + body).slice(0, maxLen);
}

// Helper: Post to X (Shared Logic)
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

    return await response.json();
}

// Config for Netlify Schedule
exports.config = {
    schedule: "0 0,12 * * *" // Runs at 00:00 and 12:00 UTC
};
