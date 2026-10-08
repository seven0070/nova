import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import Ajv from "ajv";
export type MCPConfig = { base: string; key?: string; tools?: string[] };
export async function callMCP(
  config: MCPConfig,
  tool: string | undefined,
  args: unknown,
  signal: AbortSignal,
) {
  const client = new Client(
    { name: "Nova", version: "0.14.0" },
    { capabilities: {} },
  );
  const transport = new StreamableHTTPClientTransport(new URL(config.base), {
    requestInit: {
      headers: config.key ? { Authorization: "Bearer " + config.key } : {},
      redirect: "error",
    },
    fetch: async (input, init) =>
      fetch(input, {
        ...init,
        redirect: "error",
        signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
      }),
  });
  try {
    await client.connect(transport);
    const listed = await client.listTools({}, { signal, timeout: 20000 }),
      tools = listed.tools.slice(0, 80);
    if (!tool)
      return {
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
          enabled: config.tools?.includes(t.name) === true,
        })),
        truncated: !!listed.nextCursor || listed.tools.length > 80,
        protocol: "MCP Streamable HTTP",
      };
    if (!config.tools?.includes(tool))
      throw new Error("MCP tool is not enabled in this connection");
    const definition = tools.find((t) => t.name === tool);
    if (!definition) throw new Error("Tool not discovered");
    if ("$async" in definition.inputSchema)
      throw new Error("Asynchronous schemas are not supported");
    const ajv = new Ajv({ strict: false, allErrors: true });
    if (!ajv.validate(definition.inputSchema, args))
      throw new Error("Invalid MCP arguments: " + ajv.errorsText());
    const result = await client.callTool(
      { name: tool, arguments: args as Record<string, unknown> },
      undefined,
      { signal, timeout: 30000 },
    );
    if (JSON.stringify(result).length > 500000)
      throw new Error("MCP result exceeds limit");
    return result;
  } finally {
    await client.close().catch(() => {});
  }
}
