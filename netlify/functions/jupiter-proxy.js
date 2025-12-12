const fetch = require('node-fetch'); // Using v2 for CJS compatibility
// Native fetch in Lambda can be finicky with DNS. node-fetch v2 is battle-tested.

exports.handler = async (event, context) => {
    // Enable CORS
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const { endpoint, ...params } = event.queryStringParameters || {};
        const body = event.body ? JSON.parse(event.body) : null;

        let targetUrl = '';
        let method = event.httpMethod;
        let options = {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        };

        // endpoint param determines route: 'strict-list', 'quote', 'swap'
        if (endpoint === 'strict-list') {
            targetUrl = 'https://token.jup.ag/strict';
        } else if (endpoint === 'quote') {
            // Reconstruct query string for quote
            const query = new URLSearchParams(params).toString();
            targetUrl = `https://quote-api.jup.ag/v6/quote?${query}`;
        } else if (endpoint === 'swap') {
            targetUrl = 'https://quote-api.jup.ag/v6/swap';
            options.body = JSON.stringify(body);
            // Swap instructions usually POST
            method = 'POST';
            options.method = 'POST';
        } else {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Invalid endpoint specified' })
            };
        }

        console.log(`Proxying to: ${targetUrl}`);

        const response = await fetch(targetUrl, options);
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Jupiter API Error (${response.status}):`, errorText);
            return {
                statusCode: response.status,
                headers,
                body: errorText
            };
        }

        const data = await response.json();
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(data)
        };

    } catch (error) {
        console.error("Proxy Error:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};
