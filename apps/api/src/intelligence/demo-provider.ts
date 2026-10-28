import { Injectable } from '@nestjs/common';

/** Safe offline implementation: NEVER fetches external data or sends communications. */
@Injectable()
export class DemoIntelligenceProvider {
  research(account: {name:string;website:string;industry:string;hypothesis:string;country?:string|null}) {
    return {
      title:`Research outline for ${account.name}`,
      company:{name:account.name,website:account.website,industry:account.industry,country:account.country||'Not recorded'},
      summary:`The prospect record categorizes ${account.name} under ${account.industry}. No independent website research has been performed.`,
      fitHypothesis:account.hypothesis,
      possibleServices:['Data annotation and quality control (hypothesis)','Structured evaluation and human review (hypothesis)'],
      unknowns:['Actual AI/data workflow','Vendor purchasing authority','Budget and project timing','Technical or compliance requirements'],
      sources:[{label:'CRM account record',type:'INTERNAL',verified:false}],
      warning:'DEMO ONLY — derived from existing CRM fields, not web research. Do not treat hypotheses as verified company facts.'
    };
  }
  discover(account:{name:string;industry:string}) {
    return {seed:account.name,category:'ILLUSTRATIVE_LOOKALIKES',companies:[
      {name:'Example Research Labs — DEMO',domain:'research-labs.example',similarity:'Illustrative company in the same market',fit:'Possible specialist annotation needs'},
      {name:'Example Vision Systems — DEMO',domain:'vision-systems.example',similarity:'Illustrative adjacent AI/data business',fit:'Possible quality assurance needs'},
      {name:'Example Data Platforms — DEMO',domain:'data-platforms.example',similarity:'Illustrative data-intensive organization',fit:'Possible data-review needs'}
    ],warning:`DEMO ONLY — fictional examples, NOT actual competitors of ${account.name}. Verify all real companies through approved sources before adding to the pipeline.`};
  }
  rank(contacts:{id:string;name:string;title:string;verified:boolean;email?:string|null;optedOut:boolean}[]){
    const score=(p:typeof contacts[number])=>{
      const role=p.title.toLowerCase();
      let n=role.match(/(head|director|vp|vice president)/)?77:role.match(/(cto|chief technology|founder)/)?72:role.match(/(manager|lead)/)?64:46;
      if(role.match(/(machine learning|data|ai|engineering|technical|research|operations)/))n+=12;
      if(p.verified)n+=4;
      if(p.optedOut)n=0;
      return Math.min(n,95);
    };
    return {rankings:contacts.map(p=>({contactId:p.id,name:p.name,title:p.title,score:score(p),reason:p.optedOut?'Contact opted out. Do not send outreach.':`Heuristic based on job title (${p.title}) and recorded verification; purchasing authority is unknown.`,canContact:!p.optedOut&&Boolean(p.email)})).sort((a,b)=>b.score-a.score),warning:'DEMO ONLY — role-title heuristic, not externally validated, and not a prediction of response probability.'};
  }
  draft(account:{name:string;industry:string;hypothesis:string},contact:{name:string;title:string},sender:{name:string;services?:string[];signature?:string}={name:'Your company'}){
    const first=contact.name.trim().split(/\s+/)[0]||'there';
    const services=sender.services?.length?'Our services include '+sender.services.join(', ')+'.':'I would like to discuss whether our services could support your team.';
    return {subject:`Exploring a potential partnership with ${account.name}`,body:`Hi ${first},\n\nI'm reaching out from ${sender.name}. ${services}\n\nWould you be open to a short conversation about your team's requirements?\n\nBest,\n${sender.signature||sender.name+' Sales Team'}`,warning:'DEMO DRAFT. Review before sending. No independent research has been performed.'};
  }
  revise(subject:string,body:string,instruction:string,sender?:{name:string;signature?:string}){
    const i=instruction.toLowerCase();
    if(i.includes('short')){
      const closing=body.lastIndexOf('\n\nBest,\n');
      const signature=sender?'\n\nBest,\n'+(sender.signature||sender.name+' Sales Team'):closing>=0?body.slice(closing):'';
      return {subject,body:body.split('\n\n').slice(0,2).join('\n\n')+signature};
    }
    return {subject,body:`${body.trim()}\n\n[DEMO REVISION REQUEST: ${instruction.trim()}]`};
  }
  analyze(body:string){
    const text=body.toLowerCase();
    const match=(r:RegExp)=>r.test(text);
    const classification=match(/unsubscribe|remove me|stop contacting|opt.?out/)?'OPT_OUT':match(/out of office|automatic reply|away until/)?'AUTO_REPLY':match(/not interested|no thanks|do not need/)?'NOT_INTERESTED':match(/meeting|schedule|call|talk|interested|tell me more|send (me )?(details|information)/)?'POTENTIAL_INTEREST':'NEEDS_REVIEW';
    const nextAction=({OPT_OUT:'Stop outreach and manually confirm suppression.',AUTO_REPLY:'Wait until recipient returns; no stage change.',NOT_INTERESTED:'Review and consider nurture or closure.',POTENTIAL_INTEREST:'Review the exact reply and propose a follow-up.',NEEDS_REVIEW:'Read the reply and decide next action.'} as Record<string,string>)[classification];
    return {classification,nextAction,confidence:'DEMO_HEURISTIC',warning:'Simulated classification from simple keywords. Not AI evaluation or verified pipeline evidence; no automatic stage update.'};
  }
}
