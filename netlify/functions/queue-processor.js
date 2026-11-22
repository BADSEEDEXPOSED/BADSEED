// Scheduled Function: Process X.com Queue
// Runs at 00:00 and 12:00 UTC daily
// Compiles queued memos into a single digest tweet and posts it.

const OAuth = require('oauth-1.0a');
const crypto = require('crypto');
const { Storage } = require('./lib/storage');

const storage = new Storage('queue-data');

// Export core logic for manual usage
exports.processQueue = async (logType = "AUTO_DIGEST") => {
    console.log(`[Queue Processor] Running (${logType}) at`, new Date().toISOString());

    const lock = crypto.randomUUID();
    let acquired = false;
    try {
        acquired = await storage._fetch('SET', 'queue-data:posting-lock', lock, 'NX', 'EX', 300) === 'OK';
        if (!acquired) return { statusCode: 409, body: JSON.stringify({ error: 'Queue processor already running' }) };
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
        const { validNarrative } = require('./lib/narrative-validation');
        const narrative = require('./ai-narrative');
        for (const item of queue) {
            if (validNarrative(item.aiLog)) continue;
            const result = await narrative.handler({ httpMethod: 'POST', body: JSON.stringify({ transactions: [{ signature: item.signature || item.id, memo: item.memo }] }) });
            const replacement = JSON.parse(result.body).logs?.[0];
            if (!validNarrative(replacement)) throw new Error('Transmission interpretation pending; queue retained');
            item.aiLog = replacement;
        }
        const digest = formatTweet(queue);
        const tweetText = digest.text;
        console.log('[Queue Processor] Formatted Tweet:', tweetText);

        // 3. Post to X
        const postResult = await postToX(tweetText);
        const tweetId = postResult.data?.id;
        if (!tweetId) throw new Error('X did not return a post ID; queue retained');
        await storage.set('processor-status', { state: 'posted', checkedAt: new Date().toISOString(), tweetId });
        console.log('[Queue Processor] Post Success:', tweetId);

        // 4. Archive & Clear
        let history = await storage.get('posted-history') || [];
        const postedIds = new Set(digest.itemIds);
        const postedItems = queue.filter(item => postedIds.has(item.id));
        postedItems.forEach(item => {
            if (item.memo && !history.includes(item.memo)) {
                history.push(item.memo);
            }
        });
        // Keep history sane
        if (history.length > 200) history = history.slice(-100);

        await storage.set('posted-history', history);
        // Preserve items that did not fit in this post and anything added while
        // the post was in flight. They will be handled by the next cycle.
        const latestQueue = await new Storage('queue-data').get('queue') || [];
        await storage.set('queue', latestQueue.filter(item => !postedIds.has(item.id)));

        // 5. UPDATE TRANSMISSION LOG
        const logStorage = new Storage('transmission-log');
        let logs = await logStorage.get('logs') || [];
        logs.unshift({
            id: tweetId,
            text: tweetText,
            date: new Date().toISOString(),
            type: logType, // Dynamic Type
            link: `https://x.com/i/status/${tweetId}`
        });
        if (logs.length > 50) logs.pop();
        await logStorage.set('logs', logs);

        console.log(`[Queue Processor] Queue cleared and Transmission Log (${logType}) updated.`);

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, tweetId: tweetId })
        };

    } catch (error) {
        console.error('[Queue Processor] Error:', error);
        await storage.set('processor-status', { state: 'error', checkedAt: new Date().toISOString(), error: error.message }).catch(() => {});
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    } finally {
        if (acquired) await storage._fetch('EVAL', "if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end", 1, 'queue-data:posting-lock', lock).catch(() => {});
    }
};

exports.handler = async (event, context) => {
    return exports.processQueue("AUTO_DIGEST");
};

// Helper: Format Tweet (Ported from xPosting.js)
function formatTweet(items) {
    const maxLen = 280;
    const header = "🌱 BADSEED TRANSMISSION LOG 🌱\n\n";
    const footer = "#BADSEED #Solana";
    let body = "";
    const itemIds = [];

    // Sort logic? Oldest first? 
    // Usually FIFO is best for logs. items[0] is oldest if push/push? 
    // Assuming queue is array of objects {memo, aiLog}

    const seenMemos = new Set();
    const cleanForX = (s) => String(s || '').replace(/^\s*(?:\[\d+\]|\{\d+\})\s*/g, '').replace(/(^|["\s])(?:\[\d+\]|\{\d+\})\s+/g, '$1').replace(/https?:\/\/\S+/gi, '[link]').replace(/\s{2,}/g, ' ').trim();
    for (const item of items) {
        const cleanMemo = cleanForX(item.memo);
        if (seenMemos.has(cleanMemo)) {
            itemIds.push(item.id);
            continue;
        }
        seenMemos.add(cleanMemo);
        const cleanAi = cleanForX(item.aiLog);
        const line = `📨 "${cleanMemo}"\n→ ${cleanAi}\n\n`;
        const remaining = maxLen - header.length - footer.length - body.length;

        if (remaining <= 0) break;
        if (line.length > remaining && body) break;
        if (line.length > remaining) body += line.slice(0, Math.max(0, remaining - 1)) + "…";
        else body += line;
        itemIds.push(item.id);
    }
    return { text: (header + body + footer).slice(0, maxLen), itemIds };
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

    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
        const response = await fetch(request_data.url, {
            method: 'POST', headers: { ...authHeader, 'Content-Type': 'application/json' }, body: JSON.stringify({ text })
        });
        if (response.ok) return await response.json();
        const errorText = await response.text();
        lastError = new Error(`X API Error ${response.status}: ${errorText}`);
        if (response.status !== 429 && response.status < 500) break;
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
    }
    throw lastError;
}

// Config for Netlify Schedule
exports.config = {
    schedule: "0 */2 * * *" // Runs every 2 hours (12 times daily starting at 00:00 UTC)
};
