import { Injectable } from '@nestjs/common';
import { STAGES,STAGE_FIELDS,StageId } from '@seebot/shared';

type AccountContext={name:string;industry:string;domain:string;website:string;hypothesis:string;contacts:{name:string;title:string;verified:boolean}[]};
type OpportunityContext={id:string;title:string;stage:string;serviceLine:string;account:AccountContext};
export type FieldSuggestion={key:string;value:string;status:'INTERNAL_CONTEXT'|'RECOMMENDATION'|'NEEDS_EVIDENCE';reason:string};

/** Offline-only deterministic drafts. No fabricated URLs, meetings, signatures, budgets, or contact identities. */
@Injectable()
export class DemoOpportunityAssistant {
  suggest(opp:OpportunityContext,stage:StageId,notes='',fieldKey?:string){
    const a=opp.account;
    const select=(key:string):FieldSuggestion=>{
      const need=(reason:string):FieldSuggestion=>({key,value:'',status:'NEEDS_EVIDENCE',reason});
      if(key==='companySummary')return {key,value:`CRM record: ${a.name} is categorized under ${a.industry}. Website recorded: ${a.website}. Independent company research is still required.`,status:'INTERNAL_CONTEXT',reason:'Taken from Seebot CRM metadata only, not verified external research.'};
      if(key==='opportunityHypothesis')return {key,value:(a.hypothesis?.trim()||`Explore whether ${a.name} could benefit from Seebot's ${opp.serviceLine} capabilities. This is an unverified opportunity hypothesis.`)+(notes.trim()?`\nEmployee notes (unverified): ${notes.trim().slice(0,600)}`:''),status:'RECOMMENDATION',reason:'Based on Seebot targeting notes; customer needs remain unconfirmed.'};
      if(key==='nextAction')return {key,value:'Verify company research sources and identify an appropriate buyer before preparing outreach.',status:'RECOMMENDATION',reason:'Suggested next action, not a completed activity.'};
      if(key==='researchSource')return need('No independent source was accessed. Enter a genuine URL or citation after reviewing it.');
      if(key==='followupDate'||key==='deliveryDate')return need('A factual date must be selected by an employee using a real record.');
      if(key==='clientAcceptance'||key==='budgetStatus'||key==='pricingModel')return need('This selection requires actual client or commercial evidence; AI cannot confirm it.');
      if(['interestDetails','painPoint','buyingProcess','decisionTimeline','securityApproval','qaResults','commercialTerms','handoffOwner'].includes(key))return need('Requires direct customer confirmation, signed evidence, or an internal verified record.');
      const field=STAGE_FIELDS[stage].find(f=>f.key===key);
      if(!field||field.type==='select'||field.type==='date')return need('Requires an employee-verified source.');
      const prompts:Record<string,string>={
        technicalScope:'Prepare a technical discovery checklist: input media formats, annotation types, quality thresholds, review workflow, delivery schedule and security constraints. Confirm requirements with the customer.',
        pilotScope:'Draft an exploratory pilot proposal outline: sample volume, annotation or evaluation methodology, staffing, acceptance metrics and delivery schedule. All scope details require client approval.',
        feasibility:'Assess internal staffing, tooling, taxonomy maturity, throughput, reviewer calibration and data access before committing to feasibility.',
        dataAuthorization:'Obtain customer authorization and confirm access controls, data storage location, retention, confidentiality and permitted processing before pilot work.',
        qaPlan:'Propose a quality plan covering annotation guidelines, gold-standard samples, inter-annotator agreement, reviewer sampling and acceptance thresholds. Agree metrics with the customer.'
      };
      return {key,value:prompts[key]||'',status:'RECOMMENDATION',reason:'Planning guidance only; not verified stage evidence.'};
    };
    return STAGE_FIELDS[stage].filter(f=>!fieldKey||f.key===fieldKey).map(f=>select(f.key));
  }
  fictionalScenario(stage:StageId,fieldKey?:string):FieldSuggestion[]{
    const examples:Record<string,string>={
      companySummary:'DEMO ONLY — Fictional Orion Vision Labs develops computer-vision analytics for live sporting events. This is a test scenario, not researched company information.',
      opportunityHypothesis:'DEMO ONLY — Explore annotation services for player tracking, ball detection and multi-camera video QA.',
      researchSource:'DEMO ONLY — internal fictional test brief; no real public source',
      nextAction:'DEMO ONLY — arrange a fictional requirements meeting with Taylor Morgan.',
      interestDetails:'DEMO ONLY — Fictional client requested a sample of ball/player event labels and a revised QA turnaround plan.',
      painPoint:'DEMO ONLY — Client says weekend match footage needs reviewer turnaround inside 24 hours and asks us to reduce errors in ball occlusion.',
      technicalScope:'DEMO ONLY — 500 sample clips in a 4K football footage pilot; box and track players, track ball, tag tackles and passes.',
      buyingProcess:'DEMO ONLY — Technical lead reviews scope; procurement requires a quote and legal review; no real approval.',
      decisionTimeline:'DEMO ONLY — Suggested fictional kickoff within six weeks, pending procurement.',
      pilotScope:'DEMO ONLY — 50 match clips with 10% double annotation and reviewer QA; changes requested include ball-occlusion escalation.',
      feasibility:'DEMO ONLY — Example estimate: 2 annotators and 1 reviewer; capacity must be confirmed before a real quote.',
      dataAuthorization:'DEMO ONLY — Fictional client requests EU-based encrypted storage and 30-day retention; actual authorization absent.',
      qaPlan:'DEMO ONLY — Propose 98% target acceptance on key event classes and weekly QA reviews; fictional client asks for independent spot-checks.',
      securityApproval:'DEMO ONLY — Example procurement review pending; no actual security approval granted.',
      qaResults:'DEMO ONLY — Fictional pilot measured 97.2% key-event agreement; client requested corrective action for missed tackles.',
      commercialTerms:'DEMO ONLY — Hypothetical $8,000 monthly retainer subject to signed contract; includes monthly quality review.',
      handoffOwner:'DEMO ONLY — Example owner: Delivery Lead (not yet assigned).'
    };
    return STAGE_FIELDS[stage].filter(f=>!fieldKey||f.key===fieldKey).map(f=>{
      const value=f.type==='date'||f.type==='select'?'':examples[f.key]||`DEMO ONLY — Fictional ${f.label.toLowerCase()} for evaluation and editing.`;
      return {key:f.key,value,status:value?'RECOMMENDATION':'NEEDS_EVIDENCE',reason:value?'Fictional test fixture. Cannot be submitted as actual stage evidence.':'Dates and selections require real evidence; never auto-confirmed.'};
    });
  }
  reviseFields(fields:Record<string,string>,instruction:string,fieldKey?:string){
    const lower=instruction.toLowerCase();
    const updated={...fields};let changed=false;
    for(const key of Object.keys(updated)){
      if(fieldKey&&fieldKey!==key)continue;
      const value=updated[key];if(!value)continue;
      if(/short|concise|brief/.test(lower)&&value.length>160){updated[key]=value.slice(0,Math.min(180,value.lastIndexOf(' ',180)>100?value.lastIndexOf(' ',180):180)).trim().replace(/[,:;]$/,'')+'.';changed=true;}
      else if(/bullets?|list/.test(lower)&&value.includes('. ')){updated[key]=value.split(/\.\s+/).filter(Boolean).map(x=>'- '+x.replace(/\.$/,'').trim()).join('\n');changed=true;}
      else if(value.startsWith('DEMO ONLY')&&/client|change|focus|qa|turnaround|pricing|budget|scope|timeline|reply|revise/i.test(lower)){updated[key]=value+`\nDEMO ONLY — Fictional client feedback to consider: ${instruction.slice(0,400)} (not verified).`;changed=true;}
    }
    return {fields:updated,changed,warning:changed?'DEMO formatting-only revision. Review wording and facts before applying.':'DEMO provider recorded your instruction, but cannot interpret arbitrary editing requests. The original fields are unchanged until OpenAI is connected.'};
  }
  plan(opp:OpportunityContext,notes:string){
    return {opportunityId:opp.id,company:opp.account.name,createdFrom:'INTERNAL_CRM_ONLY',employeeContext:notes,stages:STAGES.map((s,i)=>({stage:s.id,title:s.label,position:i+1,classification:i===0?'PREPARATION':'FUTURE_WORK',suggestions:this.suggest(opp,s.id),milestone:i<3?'Review suggested context and collect required evidence':'Complete only after actual customer or project events',complete:false})),warning:'DEMO PLANNING BLUEPRINT — no external research, outreach, meetings, contracts or delivery has occurred. No stage is marked complete and no official evidence has been changed.'};
  }
}
