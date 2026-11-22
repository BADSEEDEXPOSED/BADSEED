// Scheduled Function: Reveal and Post Daily Prophecy to X.com
// Idempotent + Redis-locked + auto-retried every 10 minutes after 18:00 UTC until posted.

const { Storage } = require('./lib/storage');
const OAuth = require('oauth-1.0a');
const crypto = require('crypto');
const { generateProphecy } = require('./lib/prophecy-logic');

const storage = new Storage('sentiment-data');

function buildProphecyTweet(text, dominant, date) {
    const header = `🔮 BADSEED DAILY PROPHECY 🔮\n\n`;
    const footer = `\n\n📊 Dominant energy: ${(dominant || 'MYSTERY').toUpperCase()}\n\n#BADSEED #Solana #Crypto`;
    const maxBody = 280 - header.length - footer.length;
    let body = String(text || '').trim();
    if (body.length > maxBody) {
        body = body.slice(0, Math.max(0, maxBody - 3)).replace(/\s+\S*$/, '').trim() + '...';
    }
    return `${header}${body}${footer}`.slice(0, 280);
}

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
    };

    const lock = crypto.randomUUID();
    let acquired = false;
    try {
        acquired = await storage._fetch('SET', 'sentiment-data:prophecy-post-lock', lock, 'NX', 'EX', 120) === 'OK';
        if (!acquired) {
            return { statusCode: 409, headers, body: JSON.stringify({ message: 'Prophecy reveal already in progress' }) };
        }

        const today = new Date().toISOString().split('T')[0];
        let storageData = await storage.get('data');

        // Self-healing: if no prophecy for today, generate a fresh AI prophecy right now
        if (!storageData || !storageData.prophecy || storageData.prophecy.date !== today || !storageData.prophecy.text) {
            console.log('[Prophecy Reveal] Missing prophecy for today. Triggering self-healing generation...');
            const genResult = await generateProphecy(true);
            if (genResult.success && genResult.prophecy) {
                if (!storageData) storageData = {};
                storageData.prophecy = genResult.prophecy;
            } else {
                storageData = await storage.get('data');
            }
        }

        let data = storageData || {
            totalMemos: 0,
            sentiments: { hope: 0, greed: 0, fear: 0, mystery: 0 },
            prophecy: { text: '', date: '', ready: false }
        };

        const prophecy = data.prophecy || {};
        if (prophecy.text) {
            prophecy.text = prophecy.text.replace(/\s*\(AI Unavailable\)\s*$/i, '').trim();
        }

        if (!prophecy.text || prophecy.date !== today) {
            return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to generate prophecy' }) };
        }

        // Only skip if ALREADY revealed AND successfully posted to X
        if (prophecy.ready && prophecy.x_post_status === 'posted') {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    alreadyPosted: true,
                    tweetId: prophecy.tweetId || null,
                    prophecy: prophecy.text
                })
            };
        }

        const wasAlreadyRevealed = Boolean(prophecy.ready);
        data.prophecy.ready = true;
        if (!data.prophecy.revealedAt) {
            data.prophecy.revealedAt = new Date().toISOString();
        }
        if (!data.prophecy.x_post_status) {
            data.prophecy.x_post_status = 'pending';
        }
        if (!wasAlreadyRevealed && data.sentiments) {
            data.sentiments.mystery = 0;
        }
        await storage.set('data', data);

        // Build guaranteed <= 280-char unique tweet
        const tweetText = buildProphecyTweet(prophecy.text, prophecy.dominant, today);

        let postSuccess = false;
        let lastError = '';

        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                console.log(`[Prophecy Reveal] Posting to X (Attempt ${attempt}/3)...`);
                const postResult = await postToX(tweetText);
                const tweetId = postResult?.id || postResult?.data?.id;
                if (!tweetId) throw new Error('X API returned no tweet ID');

                data.prophecy.postedAt = new Date().toISOString();
                data.prophecy.tweetId = tweetId;
                data.prophecy.x_post_status = 'posted';
                data.prophecy.last_post_error = null;
                await storage.set('data', data);

                try {
                    const logStorage = new Storage('transmission-log');
                    let logs = await logStorage.get('logs') || [];
                    logs.unshift({
                        id: tweetId,
                        text: tweetText,
                        date: data.prophecy.postedAt,
                        type: 'DAILY_PROPHECY',
                        link: `https://x.com/i/status/${tweetId}`
                    });
                    if (logs.length > 50) logs.pop();
                    await logStorage.set('logs', logs);
                } catch (logErr) {
                    console.warn('[Prophecy Reveal] Failed to update transmission-log:', logErr.message);
                }

                postSuccess = true;
                break;
            } catch (postError) {
                console.error(`[Prophecy Reveal] Attempt ${attempt} failed:`, postError.message);
                lastError = postError.message;
                // Don't burn retries on hard 401/402/403 billing/auth errors
                if (/\b(401|402|403)\b/.test(lastError)) break;
                if (attempt < 3) await new Promise(r => setTimeout(r, 1500 * attempt));
            }
        }

        if (!postSuccess) {
            data.prophecy.x_post_status = 'failed';
            data.prophecy.last_post_error = lastError;
            data.prophecy.last_post_attempt = new Date().toISOString();
            await storage.set('data', data);
        }

        try {
            let logData = await storage.get('system_logs') || {};
            logData.last_successful_reveal = new Date().toISOString();
            logData.last_reveal_date = today;
            logData.last_x_post_status = data.prophecy.x_post_status;
            await storage.set('system_logs', logData);
        } catch (e) { }

        return {
            statusCode: postSuccess ? 200 : 502,
            headers,
            body: JSON.stringify({
                success: postSuccess,
                revealed: true,
                x_post_status: data.prophecy.x_post_status,
                tweetId: data.prophecy.tweetId || null,
                error: postSuccess ? null : lastError,
                prophecy: prophecy.text
            })
        };
    } catch (error) {
        console.error('[Prophecy Reveal] Error:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    } finally {
        if (acquired) {
            await storage._fetch('EVAL', "if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end", 1, 'sentiment-data:prophecy-post-lock', lock).catch(() => {});
        }
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

exports.config = {
    schedule: "0 18 * * *"
};
