import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js'

// A dependency protocol fixture: deliberately imports no application or Slack code.
if (import.meta.main) {
  const server = new Server(
    { name: 'stdio-dependency-fixture', version: '1.0.0' },
    { capabilities: { tools: {} } },
  )
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'fixture_echo',
        description: 'Return a synthetic fixture value',
        inputSchema: {
          type: 'object',
          properties: { text: { type: 'string' } },
          required: ['text'],
          additionalProperties: false,
        },
      },
    ],
  }))
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (
      request.params.name !== 'fixture_echo' ||
      typeof request.params.arguments?.text !== 'string'
    ) {
      throw new McpError(ErrorCode.InvalidParams, 'Unknown fixture tool or invalid text')
    }
    return { content: [{ type: 'text', text: request.params.arguments.text }] }
  })
  await server.connect(new StdioServerTransport())
}
