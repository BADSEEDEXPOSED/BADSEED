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
// (Currently Empty)


// ------------------------------------------------------------------
// STARTUP
// ------------------------------------------------------------------
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("BadSeed Exposed Node active and waiting on stdio.");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
