// Netlify Serverless Function: Solana RPC Proxy
// Endpoint: /.netlify/functions/solana-rpc

const RPC_ENDPOINT = "https://mainnet.helius-rpc.com/?api-key=65cfa9f7-7bfe-44ff-8e98-24ff80b01e8c";

exports.handler = async (event) => {
    // Only allow POST
    if (event.httpMethod !== "POST") {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: "Method Not Allowed" }),
        };
    }

    try {
        const body = JSON.parse(event.body || "{}");

        // Forward request to Helius
        const response = await fetch(RPC_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            console.error("Upstream RPC error:", response.status, await response.text());
            return {
                statusCode: 502,
                body: JSON.stringify({ error: "Upstream RPC failed" }),
            };
        }

        const data = await response.json();

        return {
            statusCode: 200,
            body: JSON.stringify(data),
        };
    } catch (error) {
        console.error("RPC Proxy Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Internal Server Error" }),
        };
    }
};
