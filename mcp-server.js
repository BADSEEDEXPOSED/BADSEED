#!/usr/bin/env node

require('dotenv').config(); // Load local env for local testing
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");

// Import core logic from the Netlify Functions library
// This allows the MCP server to act as a local Admin Console using the same logic as the Cloud
const { generateProphecy } = require('./netlify/functions/lib/prophecy-logic');
const { Storage } = require('./netlify/functions/lib/storage');

const storage = new Storage('sentiment-data');

// Initialize MCP Server
const server = new McpServer({
  name: "badseed-exposed",
  version: "1.0.0"
});

// --------------------------------------------------------------------------
// TOOL: get_prophecy_debug
// Purpose: Read the raw state of the prophecy from Redis to debug "Old/Forced" data
// --------------------------------------------------------------------------
server.tool("get_prophecy_debug", {}, async () => {
  try {
    const data = await storage.get('data');
    if (!data) {
      return {
        content: [{ type: "text", text: "STORAGE_EMPTY: No data found in 'sentiment-data'." }]
      };
    }

    const debugInfo = {
      date: data.prophecy?.date || "MISSING",
      ready: data.prophecy?.ready,
      generatedAt: data.prophecy?.generatedAt || "UNKNOWN",
      x_post_status: data.prophecy?.x_post_status,
      last_error: data.last_error,
      system_status: data.system_status,
      text_preview: data.prophecy?.text ? data.prophecy.text.substring(0, 50) + "..." : "NONE"
    };

    return {
      content: [{
        type: "text",
        text: JSON.stringify(debugInfo, null, 2)
      }]
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: `ERROR: ${err.message}` }]
    };
  }
});

// --------------------------------------------------------------------------
// TOOL: check_cloud_env
// Purpose: Verify if API Keys are loaded in the current environment
// --------------------------------------------------------------------------
server.tool("check_cloud_env", {}, async () => {
  const keys = {
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    X_CONSUMER_KEY: !!process.env.X_CONSUMER_KEY,
    X_ACCESS_TOKEN: !!process.env.X_ACCESS_TOKEN,
    UPSTASH_REDIS_REST_URL: !!process.env.UPSTASH_REDIS_REST_URL
  };

  return {
    content: [{
      type: "text",
      text: `ENVIRONMENT CHECKS:\n${JSON.stringify(keys, null, 2)}\n\n(True = Key Present, False = Missing)`
    }]
  };
});

// --------------------------------------------------------------------------
// TOOL: trigger_prophecy_generation
// Purpose: Manually force a new prophecy generation cycle
// --------------------------------------------------------------------------
server.tool("trigger_prophecy_generation", {
  force: z.boolean().describe("Set true to overwrite today's prophecy if it exists")
}, async ({ force }) => {
  try {
    console.log(`[MCP] Triggering Prophecy Generation (Force: ${force})...`);
    const result = await generateProphecy(force);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "SUCCESS",
          dominant_sentiment: result.dominant,
          prophecy_preview: result.prophecy.text.substring(0, 100) + "..."
        }, null, 2)
      }]
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: `GENERATION FAILED: ${err.message}` }]
    };
  }
});

// --------------------------------------------------------------------------
// TOOL: trigger_prophecy_reveal
// Purpose: Manually reveal the prophecy (simulate 18:00 UTC)
// Note: This logic is usually in prophecy-reveal.js, so we import the logic if possible
// or reproduce the critical reveal step (setting ready=true).
// --------------------------------------------------------------------------
server.tool("trigger_prophecy_reveal", {}, async () => {
  try {
    console.log(`[MCP] Triggering Prophecy Reveal...`);
    let data = await storage.get('data');

    if (!data || !data.prophecy) {
      return { content: [{ type: "text", text: "FAIL: No prophecy exists to reveal." }] };
    }

    // Reveal it locally in DB
    data.prophecy.ready = true;
    data.prophecy.forced_ready = true; // Mark as forced
    data.prophecy.revealedAt = new Date().toISOString();

    await storage.set('data', data);

    return {
      content: [{
        type: "text",
        text: "SUCCESS: Prophecy marked as READY in database. It should now be visible on the dashboard."
      }]
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: `REVEAL FAILED: ${err.message}` }]
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("BadSeed Exposed MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
