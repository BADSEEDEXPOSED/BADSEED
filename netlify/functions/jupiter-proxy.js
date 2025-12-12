const axios = require('axios');
const https = require('https');

// Create an HTTPS agent that forces IPv4
const agent = new https.Agent({
    family: 4
});

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
        let method = event.httpMethod; // 'GET' or 'POST'

        // Configuration for Axios
        let axiosConfig = {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/plain, */*'
            },
            validateStatus: function (status) {
                return status < 500; // Resolve only if status is less than 500
            },
            httpsAgent: agent, // FORCE IPv4
            timeout: 8000 // 8s timeout to avoid Netlify 10s limit crash
        };

        // Endpoint routing
        if (endpoint === 'strict-list') {
            targetUrl = 'https://token.jup.ag/strict';
            axiosConfig.method = 'GET';
        } else if (endpoint === 'quote') {
            const query = new URLSearchParams(params).toString();
            targetUrl = `https://quote-api.jup.ag/v6/quote?${query}`;
            axiosConfig.method = 'GET';
        } else if (endpoint === 'swap') {
            targetUrl = 'https://quote-api.jup.ag/v6/swap';
            axiosConfig.method = 'POST';
            axiosConfig.data = body;
        } else {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Invalid endpoint specified' })
            };
        }

        axiosConfig.url = targetUrl;

        console.log(`[Proxy] Forwarding ${method} to: ${targetUrl}`);

        const response = await axios(axiosConfig);

        return {
            statusCode: response.status,
            headers,
            body: JSON.stringify(response.data)
        };

    } catch (error) {
        console.error("[Proxy] Axios Error:", error.message);
        if (error.response) {
            console.error("[Proxy] Response Data:", error.response.data);
            return {
                statusCode: error.response.status,
                headers,
                body: JSON.stringify({ error: error.message, details: error.response.data })
            };
        } else if (error.request) {
            console.error("[Proxy] No Response Received");
            return {
                statusCode: 504,
                headers,
                body: JSON.stringify({ error: "Gateway Timeout: No response from Jupiter API", details: error.message })
            };
        } else {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: "Internal Proxy Error", details: error.message })
            };
        }
    }
};
