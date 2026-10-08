import type {BackendClient} from './remote';import type {CodingSession} from './store';
/** Serial checkpoints own cloud revisions; no approvals or local execution rights cross devices. */
export class SessionPublisher{private lease='';private pending=Promise.resolve();private timer?:ReturnType<typeof setInterval>;error?:string;constructor(readonly client:BackendClient,readonly session:CodingSession,readonly control:(item:{type:'stop'|'steer';text?:string})=>void){}
 async start(){const value=await this.client.claim(this.session);this.lease=value.leaseId;this.session.revision=value.revision;this.timer=setInterval(()=>{void this.publish().catch(()=>{});},4000);this.timer.unref();}
 publish(status='running'){const operation=this.pending.then(async()=>{if(this.error)throw new Error(this.error);const result=await this.client.checkpoint(structuredClone(this.session),this.lease,status);this.session.revision=result.revision;for(const item of result.controls)this.control(item);});this.pending=operation.catch(e=>{this.error=(e as Error).message;this.control({type:'stop'});});return operation;}
 stop(){if(this.timer)clearInterval(this.timer);this.timer=undefined;}
 async finish(status:string){this.stop();await this.pending;if(this.error)throw new Error(this.error);return this.publish(['completed','failed'].includes(status)?status:'paused');}}
