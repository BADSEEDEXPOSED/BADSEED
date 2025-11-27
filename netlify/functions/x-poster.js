const OAuth = require('oauth-1.0a');
const crypto = require('crypto');

exports.handler = async function (event, context) {
    // Only allow POST requests
    if (event.httpMethod !== "POST") {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: "Method Not Allowed" }),
        };
    }

    try {
        const { text } = JSON.parse(event.body);

        if (!text) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "Missing 'text' in request body" }),
            };
        }

        // X.com API credentials
        // Support both standard and REACT_APP_ prefixed vars for convenience
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
            data: { text },
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
            body: JSON.stringify(request_data.data),
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
