# MCP plugins and skill quality

The web and worker use encrypted saved MCP connections. The device CLI/desktop now use a reviewed plugin registry in `~/.nova-cli/plugins` and the same shared MCP client. Both enforce discovered schemas and enabled tool names. Every MCP tool call requires core approval; installation does not grant blanket execution permission.

A plugin JSON file:

```json
{"id":"research","name":"Research tools","base":"https://your-mcp.example/mcp","tokenEnv":"NOVA_MCP_RESEARCH_TOKEN","tools":["search"]}
```

```sh
nova plugins add ./research.json
nova plugins list
nova plugins remove research
nova recall "bridge design"
```

Put the token in your private environment, never the manifest. Token references must begin `NOVA_MCP_`; model/provider secret variables cannot be reused implicitly. Endpoints require HTTPS or local loopback HTTP, and cannot embed credentials or query strings. The desktop Tool plugins panel installs the same registry. Device plugins support MCP Streamable HTTP; arbitrary script loading and stdio execution are not implied.

Skills remain portable declarative templates installed through `nova extensions`. Each execution stores a bounded outcome history keyed to the actual procedure fingerprint. Three consecutive failures quarantine that procedure across sessions. Saving changed steps establishes a new procedure; retrying unchanged quarantined steps requires explicit revalidation approval. Outcomes record execution success, not the model's claimed answer quality. Invalid arguments, denied steps, cancellation and tool failures do not count as successful skill executions.
