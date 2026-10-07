import {saveRecord,deleteRecord} from './local-workspace';import type {WorkspaceRecord} from '../agent/types';
export const putContextRecord=(_who:string,record:WorkspaceRecord)=>saveRecord(record);
export const removeContextRecord=(_who:string,id:string)=>deleteRecord(id);
