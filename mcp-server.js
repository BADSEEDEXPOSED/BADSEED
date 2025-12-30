// Silencing dotenv output for MCP protocol compliance
const stdoutWrite = process.stdout.write;
process.stdout.write = () => { };
require('dotenv').config();
process.stdout.write = stdoutWrite;

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");

/*
    BADSEED EXPOSED NODE (GENERIC SKELETON)
    ---------------------------------------
    This file initializes a Model Context Protocol server.
    It is currently empty.
    
    It serves as the "Voice Node" endpoint for the unified brain.
*/

// Initialize Server
const server = new McpServer({
  name: "badseed-exposed",
  version: "1.0.0"
});

// ------------------------------------------------------------------
// CAPABILITIES
// ------------------------------------------------------------------
// Imports
const { Storage } = require('./netlify/functions/lib/storage');

// Initialize Storage
const storage = new Storage('sentiment-data');

// ------------------------------------------------------------------
// CAPABILITIES
// ------------------------------------------------------------------

// Tool: Get Latest Prophecy
server.tool(
  "get_latest_prophecy",
  "Returns the current prophecy and sentiment stats from the database (Raw).",
  {}, // No input arguments required
  async () => {
    try {
      const data = await storage.get('data');
      if (!data || !data.prophecy) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "No prophecy found in database." }) }]
        };
      }

      // Return the raw prophecy object
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            date: data.prophecy.date,
            text: data.prophecy.text,
            stats: data.sentiments, // Include sentiment stats for context
            ready: data.prophecy.ready
          }, null, 2)
        }]
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: err.message }) }]
      };
    }
  }
);

// Tool: Get X.com Queue Status
const queueStorage = new Storage('queue-data');
server.tool(
  "get_queue_status",
  "Returns the current X.com posting queue.",
  {},
  async () => {
    try {
      const queue = await queueStorage.get('queue') || [];
      return {
        content: [{ type: "text", text: JSON.stringify(queue, null, 2) }]
      };
    } catch (err) {
      return { content: [{ type: "text", text: "Error fetching queue: " + err.message }] };
    }
  }
);

// Tool: Get Wallet Status (Direct RPC)
// Duplicates logic from wallet-status.js for Agent autonomy
server.tool(
  "get_wallet_status",
  "Returns the BADSEED wallet balance and recent transactions directly from Solana RPC.",
  {},
  async () => {
    const RPC_URL = process.env.REACT_APP_SOLANA_RPC_HOST || "https://api.mainnet-beta.solana.com";
    const WALLET = "9TyzcephhXEw67piYNc72EJtgVmbq3AZhyPFSvdfXWdr";

    try {
      const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

      // Helper
      const rpc = async (m, p) => {
        const r = await fetch(RPC_URL, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: m, params: p })
        });
        return (await r.json()).result;
      };

      const bal = await rpc("getBalance", [WALLET, { commitment: "finalized" }]);
      const sigs = await rpc("getSignaturesForAddress", [WALLET, { limit: 5 }]);

      const result = {
        balance: (bal?.value || 0) / 1e9,
        recent: sigs,
        rpc_url: RPC_URL
      };

      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: "RPC Error: " + err.message }] };
    }
  }
);

// Tool: Update Sentiment Rules (Dynamic Logic)
const configStorage = new Storage('sentiment-config');
server.tool(
  "update_sentiment_rules",
  "Updates the logic rules for how transactions affect sentiment.",
  {
    rules: z.string().describe("JSON string of the new rules array")
  },
  async ({ rules }) => {
    try {
      const rulesObj = JSON.parse(rules);
      await configStorage.set('rules', rulesObj);
      return { content: [{ type: "text", text: "Successfully updated sentiment logic rules." }] };
    } catch (err) {
      return { content: [{ type: "text", text: "Failed update: " + err.message }] };
    }
  }
);


// ------------------------------------------------------------------
// STARTUP
// ------------------------------------------------------------------
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // console.error("BadSeed Exposed Node active and waiting on stdio.");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
