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
