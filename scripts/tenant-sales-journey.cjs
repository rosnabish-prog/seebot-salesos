const assert=require('node:assert/strict');
/** Exercise public tenant APIs. Never changes stage, account status or evidence directly in the database. */
async function reachContracting(call,orgId,accountId,opportunityId){
 const base='/workspace-business/'+orgId+'/opportunities/'+opportunityId;
 const state=()=>call('GET',base+'/stage-state');
 const evidence=fields=>call('POST',base+'/evidence',{fields});
 let current=await state();
 if(current.stage.id==='ACCOUNT_RESEARCHED')await evidence({companySummary:'Reviewed the fictional customer company website for this test.',opportunityHypothesis:'Our recorded services may support this customer project.',researchSource:'https://customer.example/about',nextAction:'Contact the named buyer'});
 const contact=await call('POST','/workspace-crm/'+orgId+'/accounts/'+accountId+'/contacts',{name:'Fictional Buyer',title:'Procurement Director',email:'buyer@customer.example'});
 await call('POST','/workspace-crm/'+orgId+'/accounts/'+accountId+'/contacts/'+contact.id+'/verify',{reference:'https://customer.example/team · fictional test source'});
 assert.equal((await state()).stage.id,'OUTREACH_INITIATED','Verified buyer automatically advances the otherwise empty contact stage');
 await call('POST',base+'/activities',{type:'CALL',outcome:'OUTBOUND',note:'Fictional recorded outbound buyer call.'});
 await evidence({followupDate:'2030-01-15'});
 await call('POST',base+'/activities',{type:'MEETING',outcome:'POSITIVE',note:'Fictional buyer requested a discovery meeting.'});
 await evidence({interestDetails:'The fictional buyer requested a scoped discovery discussion.'});
 await evidence({painPoint:'Recorded fictional customer need',technicalScope:'Fictional test scope',buyingProcess:'Buyer and finance approval',budgetStatus:'Confirmed',decisionTimeline:'January 2030'});
 await evidence({pilotScope:'Fictional pilot specification',feasibility:'Team capacity reviewed',dataAuthorization:'Fictional data only',qaPlan:'Customer-reviewed acceptance criteria'});
 await call('POST',base+'/proposals',{title:'Fictional pilot proposal',amount:'100.00',currency:'USD',status:'SENT',acceptanceCriteria:'Fictional customer acceptance criteria recorded.'});
 current=await state();assert.equal(current.stage.id,'PILOT_CONTRACTED');
 return {contact};
}
module.exports={reachContracting};
