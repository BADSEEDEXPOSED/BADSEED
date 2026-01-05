const OAuth = require('oauth-1.0a');
const crypto = require('crypto');
const { Storage } = require('./lib/storage');

const storage = new Storage('queue-data');

exports.handler = async function (event, context) {
    // Only allow POST requests
    if (event.httpMethod !== "POST") {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: "Method Not Allowed" }),
        };
    }

    try {
        const { text, queueItemId } = JSON.parse(event.body);

        if (!text) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "Missing 'text' in request body" }),
            };
        }

        // X.com API credentials
        const consumer_key = process.env.X_CONSUMER_KEY || process.env.REACT_APP_X_CONSUMER_KEY;
        const consumer_secret = process.env.X_CONSUMER_SECRET || process.env.REACT_APP_X_CONSUMER_SECRET;
        const access_token = process.env.X_ACCESS_TOKEN || process.env.REACT_APP_X_ACCESS_TOKEN;
        const access_token_secret = process.env.X_ACCESS_SECRET || process.env.REACT_APP_X_ACCESS_SECRET;

        if (!consumer_key || !consumer_secret || !access_token || !access_token_secret) {
            console.error("Missing X.com OAuth 1.0a credentials");
            return {
                statusCode: 500,
                body: JSON.stringify({ error: "Server configuration error: Missing X API credentials" }),
            };
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

        const token = {
            key: access_token,
            secret: access_token_secret,
        };

        const authHeader = oauth.toHeader(oauth.authorize(request_data, token));

        console.log("Attempting to post to X.com (OAuth 1.0a)...");

        const response = await fetch(request_data.url, {
            method: request_data.method,
            headers: {
                ...authHeader,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("X API Error:", response.status, errorText);
            return {
                statusCode: response.status,
                body: JSON.stringify({ error: `X API Error: ${errorText}` }),
            };
        }

        const data = await response.json();
        console.log("X.com post successful:", data);

        // Remove the posted item from queue if queueItemId was provided
        if (queueItemId) {
            try {
                let queue = await storage.get('queue') || [];

                // Find the item to get its memo for history
                const itemToRemove = queue.find(item => item.id === queueItemId);

                if (itemToRemove) {
                    const originalLength = queue.length;
                    queue = queue.filter(item => item.id !== queueItemId);

                    if (queue.length < originalLength) {
                        await storage.set('queue', queue);
                        console.log(`[Queue] Removed posted item ${queueItemId} from queue`);

                        // Add memo to posted history
                        if (itemToRemove.memo) {
                            let history = await storage.get('posted-history') || [];
                            // Keep history manageable size (e.g., last 100 items)
                            if (!history.includes(itemToRemove.memo)) {
                                history.push(itemToRemove.memo);
                                if (history.length > 100) history.shift();
                                await storage.set('posted-history', history);
                                console.log('[Queue] Added memo to posted-history');
                            }
                        }
                    }
                }
            } catch (err) {
                console.error('[Queue] Failed to remove posted item:', err.message);
                // Don't fail the request, the post was successful
            }
        }

        // 5. UPDATE TRANSMISSION LOG (For Console Verification)
        const { Storage } = require('./lib/storage'); // Re-import safely or assume scope
        const logStorage = new Storage('transmission-log');
        let logs = await logStorage.get('logs') || [];
        logs.unshift({
            id: data.data.id || "unknown",
            text: text,
            date: new Date().toISOString(),
            type: "MANUAL_POST",
            link: `https://x.com/i/status/${data.data.id}`
        });
        if (logs.length > 50) logs.pop();
        await logStorage.set('logs', logs);

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, data }),
        };

    } catch (error) {
        console.error("Serverless function error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};
