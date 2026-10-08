import {connection} from './vault';import {publicHttps} from '../agent/http';import {callMCP} from '../agent/mcp-client';
export async function mcp(owner:string,id:string,tool:string|undefined,args:unknown,signal:AbortSignal){const c=await connection(owner,id);if(c.kind!=='mcp')throw new Error('Not an MCP connection');publicHttps(c.base);return callMCP(c,tool,args,signal);}
