export type Schedule={expression:string;timezone:string;kind:'interval'|'daily'|'weekly';minutes?:number;hour?:number;minute?:number;weekday?:number};
export function parseSchedule(expression:string,timezone:string):Schedule {
 new Intl.DateTimeFormat('en',{timeZone:timezone}).format();
 const text=expression.trim().toLowerCase(); if(text.length>160)throw new Error('Schedule is too long');
 const interval=/^every (?:(\d+) )?(minutes?|hours?)$/.exec(text);
 if(interval){const minutes=Number(interval[1]||1)*(interval[2].startsWith('hour')?60:1);if(minutes<5||minutes>525600)throw new Error('Interval must be 5 minutes to one year');return {expression,timezone,kind:'interval',minutes};}
 const m=/^(?:every (morning|day|sunday|monday|tuesday|wednesday|thursday|friday|saturday)|daily|weekly on (sunday|monday|tuesday|wednesday|thursday|friday|saturday)) at (\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(text);
 if(!m)throw new Error('Use “every morning at 8 AM”, “every Monday at 18:30”, or “every 2 hours”.');
 let hour=Number(m[3]);const minute=Number(m[4]||0);if(m[5]){if(hour<1||hour>12)throw new Error('Use hours 1–12 with AM/PM');hour=hour%12+(m[5]==='pm'?12:0);}if(hour>23||minute>59)throw new Error('Invalid clock time');
 const day=m[2]||m[1],weekday=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].indexOf(day||'');
 return {expression,timezone,kind:weekday<0?'daily':'weekly',hour,minute,...(weekday>=0?{weekday}:{})};
}
export function nextOccurrence(schedule:Schedule,after=Date.now()):number {
 if(schedule.kind==='interval')return after+schedule.minutes!*60000;
 const formatter=new Intl.DateTimeFormat('en-US',{timeZone:schedule.timezone,weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const local=(time:number)=>Object.fromEntries(formatter.formatToParts(time).map(p=>[p.type,p.value]));
 const previous=local(after),previousDate=previous.year+previous.month+previous.day;
 // One execution per local calendar date even when a DST clock repeats an hour.
 const alreadyRanToday=Number(previous.hour)*60+Number(previous.minute)>=schedule.hour!*60+schedule.minute!;
 for(let time=Math.floor(after/60000)*60000+60000,end=after+9*86400000;time<=end;time+=60000){const p=local(time),date=p.year+p.month+p.day;if(date===previousDate&&alreadyRanToday)continue;if(Number(p.hour)===schedule.hour&&Number(p.minute)===schedule.minute&&(schedule.kind!=='weekly'||['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(p.weekday)===schedule.weekday))return time;}
 throw new Error('No schedule occurrence within nine days');
}
