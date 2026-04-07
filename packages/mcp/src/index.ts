#!/usr/bin/env node
/**
 * PLAYBOOK.md MCP Server - Entry Point
 *
 * Starts the MCP server with stdio transport for use as:
 *   npx @playbook-md/mcp
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

export { createServer } from './server.js';

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Only run when executed directly (not imported)
const isMain = process.argv[1] &&
  (process.argv[1].endsWith('/index.js') ||
   process.argv[1].endsWith('/index.ts') ||
   process.argv[1].endsWith('\\index.js') ||
   process.argv[1].endsWith('\\index.ts'));

if (isMain) {
  main().catch((err) => {
    console.error('Failed to start MCP server:', err);
    process.exit(1);
  });
}
