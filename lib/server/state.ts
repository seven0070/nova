import type {WorkspaceRecord} from '../agent/types';
import {listRecords,saveRecord,deleteRecord,localRequest} from './local-workspace';
import {withLock} from './lock';
export async function owner(req:Request){if(!localRequest(req))throw new Error('Localhost required');return 'local';}
export async function rows(_owner:string){return (await listRecords()).records;}
export async function get<T>(owner:string,id:string):Promise<{value:T;stamp:number}|undefined>{const row=(await rows(owner)).find(r=>r.id===id);return row?{value:JSON.parse(row.content),stamp:row.updatedAt}:undefined;}
export async function set(owner:string,id:string,value:unknown){const record:WorkspaceRecord={id,kind:'run',name:id.slice(0,200),content:JSON.stringify(value),updatedAt:Math.max(Date.now(),(await get(owner,id))?.stamp||0)+1};return saveRecord(record);}
export async function remove(_owner:string,id:string){await deleteRecord(id);}
export async function cas(owner:string,id:string,stamp:number,value:unknown){return withLock('runtime-cas',async()=>{const current=await get(owner,id);if(current?.stamp!==stamp)return false;const record:WorkspaceRecord={id,kind:'run',name:id.slice(0,200),content:JSON.stringify(value),updatedAt:Math.max(Date.now(),stamp+1)};await saveRecord(record);return record.updatedAt;});}
export const runtimeName='local';

export async function create(owner:string,id:string,value:unknown){return withLock('runtime-cas',async()=>{if(await get(owner,id))return false;return (await set(owner,id,value)).updatedAt;});}

export async function taskOwners(){return ['local'];}
