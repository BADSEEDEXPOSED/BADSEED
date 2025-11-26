// const fetch = require("node-fetch"); // Use native fetch in Node 18+

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

        // X.com API credentials from environment variables
        const X_API_URL = "https://api.x.com/2/tweets";
        const BEARER = process.env.REACT_APP_X_BEARER_TOKEN;
        // Note: For OAuth 2.0 Bearer Token, we just need the Bearer token.
        // If using OAuth 1.0a (User Context), we'd need more complex signing.
        // Assuming the provided Bearer token has write permissions (OAuth 2.0 App-only or User Context if setup correctly).
        // If the user provided Access Token/Secret, they might be expecting OAuth 1.0a.
        // However, v2/tweets usually supports OAuth 2.0 with User Context if the token was generated that way.
        // Let's try standard Bearer auth first as it's simplest. 
        // If the user supplied Access Token/Secret, they might be needed if Bearer fails.
        // But for now, let's mirror the client-side logic which was using Bearer + Access Token headers.

        const ACCESS_TOKEN = process.env.REACT_APP_X_ACCESS_TOKEN;
        const ACCESS_SECRET = process.env.REACT_APP_X_ACCESS_SECRET;

        // Construct headers similar to what was attempted on client
        const headers = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${BEARER}`,
        };

        // Some setups might require these custom headers if using a specific proxy or library, 
        // but standard X API usually just wants Authorization. 
        // We'll include them just in case the user's setup relies on them, 
        // but standard v2 API uses Authorization header.
        if (ACCESS_TOKEN) headers["X-Access-Token"] = ACCESS_TOKEN;
        if (ACCESS_SECRET) headers["X-Access-Secret"] = ACCESS_SECRET;

        console.log("Attempting to post to X.com from serverless function...");

        const response = await fetch(X_API_URL, {
            method: "POST",
            headers: headers,
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
