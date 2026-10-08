export class DecisionQueue{
 private active=0;private waiting:{resolve:(release:()=>void)=>void;reject:(e:unknown)=>void;signal:AbortSignal;stop:()=>void}[]=[];
 constructor(readonly concurrency=4,readonly capacity=16){}
 stats(){return {active:this.active,waiting:this.waiting.length,capacity:this.capacity};}
 async acquire(signal:AbortSignal):Promise<()=>void>{signal.throwIfAborted();if(this.active<this.concurrency){this.active++;return this.release();}if(this.waiting.length>=this.capacity)throw Object.assign(new Error('Backend queue full; retry shortly'),{status:429});return new Promise((resolve,reject)=>{const entry={resolve,reject,signal,stop:()=>{this.waiting=this.waiting.filter(e=>e!==entry);reject(signal.reason);}};signal.addEventListener('abort',entry.stop,{once:true});this.waiting.push(entry);});}
 private release(){let done=false;return ()=>{if(done)return;done=true;this.active--;while(this.waiting.length){const next=this.waiting.shift()!;next.signal.removeEventListener('abort',next.stop);if(next.signal.aborted){next.reject(next.signal.reason);continue;}this.active++;next.resolve(this.release());break;}};}
}
