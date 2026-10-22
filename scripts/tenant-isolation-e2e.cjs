/* Cross-tenant HTTP verification against a disposable GitHub Actions database.
 * Never run against production or a database containing customer records.
 */
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {createHmac,randomUUID}=require('node:crypto');
const {PrismaClient}=require('@prisma/client');
const db=new PrismaClient();
const port=4199;
const base='http://127.0.0.1:'+port+'/api';
const jwtSecret=process.env.JWT_SECRET;
if(process.env.CI!=='true'||!process.env.DATABASE_URL?.includes('ci_only_password')||!jwtSecret||process.env.NODE_ENV!=='test')
 throw Error('Cross-tenant tests require the isolated disposable CI database and test environment.');
function token(user,orgId,authAt=Date.now()){
 const s=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const body=s({sub:user.id,pv:user.passwordVersion,wid:orgId,mfa:true,authAt,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+1800});
 const head=s({typ:'JWT',alg:'HS256'});
 return head+'.'+body+'.'+createHmac('sha256',jwtSecret).update(head+'.'+body).digest('base64url');
}
async function hit(path,cookie,init={}){
 const response=await fetch(base+path,{...init,headers:{Cookie:'salesos_session='+cookie,'Content-Type':'application/json',...init.headers},signal:AbortSignal.timeout(7000)});
 const body=await response.json().catch(()=>({}));
 return {status:response.status,body};
}
function check(result,expected,note){
 assert.equal(result.status,expected,note+'; response: '+JSON.stringify(result.body).slice(0,500));
}
async function main(){
 const id=randomUUID().slice(0,10);
 const [a,b]=await Promise.all([1,2].map(async n=>{
  const user=await db.user.create({data:{email:'ci-tenant-'+n+'-'+id+'@example.invalid',name:'CI Tenant '+n,passwordHash:'NOT_REAL',role:'SALES_REP'}});
  const org=await db.organization.create({data:{slug:'ci-'+n+'-'+id,name:'CI Workspace '+n,status:'SETUP',memberships:{create:{userId:user.id,role:'OWNER'}}}});
  const account=await db.account.create({data:{organizationId:org.id,name:'CI Fictional Account '+n,domain:'ci-'+n+'-'+id+'.example',website:'https://ci-'+n+'-'+id+'.example',industry:'Testing',hypothesis:'CI demo',ownerId:user.id,isDemo:true}});
  const invoice=await db.invoice.create({data:{accountId:account.id,number:'DEMO-CI-'+n+'-'+id,status:'DRAFT',currency:'USD',lineItems:[{description:'Test service',quantity:1,unitPrice:10}],subtotal:'10',tax:'0',total:'10',billingEmail:'billing'+n+'@example.invalid',dueAt:new Date('2030-01-01'),isDemo:true,createdById:user.id}});
  return {user,org,account,invoice,cookie:token(user,org.id)};
 }));
 const api=spawn(process.execPath,['apps/api/dist/main.js'],{cwd:process.cwd(),env:{...process.env,API_PORT:String(port),TENANT_SCOPED_CRM_PREVIEW:'true',DEV_EMAIL_SIGNUP_ENABLED:'true',MFA_TEST_MODE:'true',SIGNING_ENABLED:'false',GMAIL_SENDING_ENABLED:'false'},stdio:['ignore','pipe','pipe']});
 let output='';api.stdout.on('data',b=>{output+=b.toString();});api.stderr.on('data',b=>{output+=b.toString();});
 try{
  let ready=false;
  for(let i=0;i<45;i++){
   if(api.exitCode!==null)throw Error('API quit unexpectedly: '+output);
   try{const res=await fetch('http://127.0.0.1:'+port+'/health',{signal:AbortSignal.timeout(1000)});if(res.ok){ready=true;break;}}catch{}
   await new Promise(r=>setTimeout(r,500));
  }
  if(!ready)throw Error('API never became ready: '+output);
  check(await hit('/workspace-crm/'+a.org.id+'/accounts',a.cookie),200,'Own account list');
  check(await hit('/auth/me',token(a.user,a.org.id,Date.now()-8*24*60*60*1000)),401,'Sessions older than seven days require fresh sign-in and MFA');
  check(await hit('/workspace-business/'+a.org.id+'/invoices/'+a.invoice.id,a.cookie),200,'Own invoice');
  check(await hit('/workspace-tax/'+a.org.id+'/rules',a.cookie),200,'Own finance rules');
  check(await hit('/workspace-accounting/'+a.org.id+'/reconciliation',a.cookie),200,'Own accounting reconciliation');
  check(await hit('/workspace-accounting/'+b.org.id+'/reconciliation',a.cookie),403,'Foreign accounting reconciliation denied');
  check(await hit('/workspace-finance-automation/'+a.org.id+'/reminders',a.cookie),200,'Own finance automation review queue');
  check(await hit('/workspace-finance-automation/'+b.org.id+'/reminders',a.cookie),403,'Foreign finance automation denied');
  const audit=await hit('/workspaces/'+a.org.id+'/security-audit',a.cookie);
  check(audit,200,'Own administrator security audit');
  assert.equal(audit.body.policy.mfaRequiredEverySignIn,true);
  assert.equal(audit.body.policy.sessionMaxAgeDays,7);
  check(await hit('/workspaces/'+b.org.id+'/security-audit',a.cookie),403,'Foreign workspace security audit denied');

  // All restored navigation pages use selected-tenant APIs, not the legacy global controllers.
  check(await hit('/workspace-business/'+a.org.id+'/tasks',a.cookie),200,'Own workspace tasks');
  check(await hit('/workspace-business/'+b.org.id+'/tasks',a.cookie),403,'Other company tasks denied');
  const task=await hit('/workspace-business/'+a.org.id+'/tasks',a.cookie,{method:'POST',body:JSON.stringify({title:'Fictional CI followup'})});
  check(task,201,'Create scoped task');
  check(await hit('/workspaces/'+a.org.id+'/member-options',a.cookie),200,'Own task assignee options');
  check(await hit('/workspaces/'+b.org.id+'/member-options',a.cookie),403,'Foreign task assignee options denied');
  check(await hit('/workspace-business/'+a.org.id+'/tasks',a.cookie,{method:'POST',body:JSON.stringify({title:'Forbidden cross-workspace assignee',assigneeId:b.user.id})}),400,'Cannot assign task to a user outside the selected workspace');
  check(await hit('/workspace-business/'+b.org.id+'/tasks/'+task.body.id,a.cookie,{method:'PATCH',body:JSON.stringify({status:'DONE'})}),403,'Cannot alter task through a foreign workspace');
  check(await hit('/workspace-business/'+a.org.id+'/tasks/'+task.body.id,a.cookie,{method:'PATCH',body:JSON.stringify({status:'DONE'})}),200,'Complete own task');
  check(await hit('/workspace-business/'+a.org.id+'/campaigns',a.cookie),200,'Own workspace campaigns');
  check(await hit('/workspace-business/'+b.org.id+'/campaigns',a.cookie),403,'Foreign company campaigns denied');
  const campaign=await hit('/workspace-business/'+a.org.id+'/campaigns',a.cookie,{method:'POST',body:JSON.stringify({name:'Fictional CI campaign',sector:'Sports'})});
  check(campaign,201,'Create scoped campaign');
  check(await hit('/workspace-business/'+a.org.id+'/campaigns/'+campaign.body.id+'/accounts',a.cookie,{method:'POST',body:JSON.stringify({accountId:a.account.id})}),201,'Enroll own account in campaign');
  check(await hit('/workspace-business/'+b.org.id+'/campaigns/'+campaign.body.id+'/accounts',a.cookie,{method:'POST',body:JSON.stringify({accountId:a.account.id})}),403,'Cross-tenant campaign enrollment denied');
  check(await hit('/workspace-business/'+a.org.id+'/campaigns/'+campaign.body.id,a.cookie,{method:'PATCH',body:JSON.stringify({status:'ACTIVE'})}),200,'Activate own campaign');
  check(await hit('/workspace-intelligence/'+a.org.id+'/accounts/'+a.account.id+'/research',a.cookie,{method:'POST',body:'{}'}),201,'Run tenant-scoped demo research');
  check(await hit('/workspace-intelligence/'+b.org.id+'/accounts/'+a.account.id+'/research',a.cookie,{method:'POST',body:'{}'}),403,'Foreign intelligence run denied');
  check(await hit('/workspace-integrations/'+a.org.id+'/gmail/status',a.cookie),200,'Read own Gmail connection readiness');
  check(await hit('/workspace-integrations/'+b.org.id+'/gmail/status',a.cookie),403,'Foreign Gmail readiness denied');
  const newOpportunity=await hit('/workspace-business/'+a.org.id+'/accounts/'+a.account.id+'/opportunities',a.cookie,{method:'POST',body:JSON.stringify({title:'CI Pipeline Deal',serviceLine:'Computer vision'})});
  check(newOpportunity,201,'Create tenant pipeline opportunity');
  check(await hit('/workspace-business/'+a.org.id+'/opportunities',a.cookie),200,'Read tenant Kanban');
  check(await hit('/workspace-business/'+b.org.id+'/opportunities',a.cookie),403,'Foreign tenant Kanban denied');
  check(await hit('/workspace-business/'+a.org.id+'/opportunities/'+newOpportunity.body.id+'/stage-state',a.cookie),200,'Read stage evidence for own opportunity');
  check(await hit('/workspace-business/'+a.org.id+'/opportunities/'+newOpportunity.body.id+'/transition',a.cookie,{method:'POST',body:JSON.stringify({targetStage:'DECISION_MAKER_IDENTIFIED'})}),400,'Stage changes without evidence require authorized override');
  check(await hit('/workspace-business/'+b.org.id+'/opportunities/'+newOpportunity.body.id+'/transition',a.cookie,{method:'POST',body:JSON.stringify({targetStage:'DECISION_MAKER_IDENTIFIED',override:true,reason:'Forbidden'})}),403,'Cross-tenant Kanban move denied');
  check(await hit('/workspace-business/'+a.org.id+'/opportunities/'+newOpportunity.body.id+'/transition',a.cookie,{method:'POST',body:JSON.stringify({targetStage:'DECISION_MAKER_IDENTIFIED',override:true,reason:'CI-only stage transition check'})}),201,'Administrator override of own fictional opportunity requires recorded reason');

  const pipelineConfig=await hit('/workspace-pipeline/'+a.org.id,a.cookie);
  check(pipelineConfig,200,'Own pipeline configuration');
  assert.equal(pipelineConfig.body.stages.length,11);
  pipelineConfig.body.stages[0].label='CI Qualified Research';
  pipelineConfig.body.stages[1].fields.push({key:'ci_research_source',label:'Research source carried forward',type:'text',required:false,autoFill:'stage.ACCOUNT_RESEARCHED.researchSource'});
  check(await hit('/workspace-pipeline/'+a.org.id,a.cookie,{method:'PATCH',body:JSON.stringify(pipelineConfig.body)}),200,'Administrator customizes own pipeline labels and prior-stage auto-pull');
  check(await hit('/workspace-pipeline/'+b.org.id,a.cookie),403,'Foreign pipeline configuration denied');

  // Client Management starts at contracting without duplicating Account records.
  await db.opportunity.update({where:{id:newOpportunity.body.id},data:{stage:'PILOT_CONTRACTED'}});
  const contractingClients=await hit('/workspace-business/'+a.org.id+'/clients',a.cookie);
  check(contractingClients,200,'Contracting relationships visible in Client Management');
  const relationship=contractingClients.body.find(x=>x.id===a.account.id);
  assert.equal(relationship?.relationshipStatus,'CONTRACTING');
  assert.equal(await db.account.count({where:{id:a.account.id}}),1,'Client lifecycle must reuse the original Account record');
  const billingContract=await hit('/workspace-business/'+a.org.id+'/opportunities/'+newOpportunity.body.id+'/contracts',a.cookie,{method:'POST',body:JSON.stringify({title:'CI Billing SOW',type:'SOW'})});
  check(billingContract,201,'Create tenant contract for billing schedule coverage');
  const recurringSchedule=await hit('/workspace-finance-automation/'+a.org.id+'/contracts/'+billingContract.body.id+'/billing-schedules',a.cookie,{method:'POST',body:JSON.stringify({description:'CI monthly service',cadence:'MONTHLY',amount:'50.00',currency:'USD',nextDueAt:'2030-02-01'})});
  check(recurringSchedule,201,'Create tenant recurring billing schedule');
  check(await hit('/workspace-finance-automation/'+b.org.id+'/contracts/'+billingContract.body.id+'/billing-schedules',a.cookie,{method:'POST',body:JSON.stringify({description:'Forbidden schedule',cadence:'MONTHLY',amount:'50.00',currency:'USD',nextDueAt:'2030-02-01'})}),403,'Foreign billing schedule creation denied');
  const scheduleContext=await hit('/workspace-finance-automation/'+a.org.id+'/billing/schedules',a.cookie);
  check(scheduleContext,200,'Read tenant billing schedules');
  assert.ok(scheduleContext.body.schedules.some(x=>x.id===recurringSchedule.body.id));

  const template=await hit('/workspace-surveys/'+a.org.id+'/templates',a.cookie,{method:'POST',body:JSON.stringify({
   name:'CI Quarterly Relationship Review',
   description:'Fictional tenant-isolated satisfaction questionnaire',
   questions:[
    {id:'overall',label:'Overall experience',type:'RATING',required:true,min:1,max:5},
    {id:'quality',label:'How was quality?',type:'SINGLE',required:true,options:['Excellent','Good','Needs work']},
    {id:'again',label:'Would you work with us again?',type:'YES_NO',required:true},
    {id:'notes',label:'Additional comments',type:'TEXT',required:false}
   ]
  })});
  check(template,201,'Create custom client questionnaire');
  check(await hit('/workspace-surveys/'+b.org.id+'/templates',a.cookie),403,'Foreign survey templates denied');
  const survey=await hit('/workspace-surveys/'+a.org.id+'/clients/'+a.account.id,a.cookie,{method:'POST',body:JSON.stringify({email:'fictional-client@example.invalid',templateId:template.body.id})});
  check(survey,201,'Create custom questionnaire for contracting client');
  assert.equal(survey.body.status,'DEMO_READY');
  const surveyToken=new URL(survey.body.previewUrl).pathname.split('/').pop();
  const publicSurvey=await hit('/surveys/'+surveyToken,'');
  check(publicSurvey,200,'Public one-time questionnaire can be opened from its token');
  assert.equal(publicSurvey.body.questionnaire.length,4);
  check(await hit('/surveys/'+surveyToken+'/respond','',{method:'POST',body:JSON.stringify({answers:{overall:5,quality:'Excellent',again:true,notes:'Fictional CI response'}})}),201,'Custom questionnaire accepts validated ratings and answers');
  const surveyHistory=await hit('/workspace-surveys/'+a.org.id+'/clients/'+a.account.id,a.cookie);
  check(surveyHistory,200,'Survey response history remains tenant scoped');
  assert.equal(surveyHistory.body.aggregates.customResponses,1);
  const satisfactionOverview=await hit('/workspace-surveys/'+a.org.id+'/overview',a.cookie);
  check(satisfactionOverview,200,'Company satisfaction overview');
  assert.equal(satisfactionOverview.body.summary.responses,1);
  assert.ok(satisfactionOverview.body.ratings.some(r=>r.label==='Overall experience'&&r.average===5));
  check(await hit('/workspace-surveys/'+b.org.id+'/overview',a.cookie),403,'Foreign satisfaction overview denied');

  const health=await hit('/workspace-business/'+a.org.id+'/clients/'+a.account.id+'/health',a.cookie);
  check(health,200,'Own client health');
  check(await hit('/workspace-business/'+b.org.id+'/clients/'+a.account.id+'/health',a.cookie),403,'Foreign client health denied');
  const issue=await hit('/workspace-business/'+a.org.id+'/clients/'+a.account.id+'/issues',a.cookie,{method:'POST',body:JSON.stringify({title:'Fictional delivery concern',details:'CI-only issue',severity:'HIGH'})});
  check(issue,201,'Create own client issue');
  check(await hit('/workspace-business/'+b.org.id+'/clients/'+a.account.id+'/issues',a.cookie,{method:'POST',body:JSON.stringify({title:'Forbidden',severity:'HIGH'})}),403,'Cross-tenant issue creation denied');
  check(await hit('/workspace-business/'+a.org.id+'/clients/'+a.account.id+'/issues/'+issue.body.id,a.cookie,{method:'PATCH',body:JSON.stringify({status:'RESOLVED'})}),200,'Resolve own client issue');
  const milestone=await hit('/workspace-business/'+a.org.id+'/clients/'+a.account.id+'/milestones',a.cookie,{method:'POST',body:JSON.stringify({title:'Fictional acceptance milestone',acceptanceCriteria:'Written CI-only acceptance criteria',contractId:billingContract.body.id})});
  check(milestone,201,'Create tenant delivery milestone');
  const milestoneSchedule=await hit('/workspace-finance-automation/'+a.org.id+'/contracts/'+billingContract.body.id+'/billing-schedules',a.cookie,{method:'POST',body:JSON.stringify({description:'CI accepted milestone fee',cadence:'MILESTONE',amount:'75.00',currency:'USD',milestoneId:milestone.body.id})});
  check(milestoneSchedule,201,'Create milestone-triggered billing schedule');
  assert.equal(milestoneSchedule.body.nextDueAt,null);
  check(await hit('/workspace-business/'+a.org.id+'/clients/'+a.account.id+'/milestones/'+milestone.body.id,a.cookie,{method:'PATCH',body:JSON.stringify({status:'ACCEPTED'})}),400,'Milestone acceptance requires evidence');
  const acceptedMilestone=await hit('/workspace-business/'+a.org.id+'/clients/'+a.account.id+'/milestones/'+milestone.body.id,a.cookie,{method:'PATCH',body:JSON.stringify({status:'ACCEPTED',evidenceReference:'CI-EVIDENCE-123'})});
  check(acceptedMilestone,200,'Accept milestone with evidence');
  assert.equal(acceptedMilestone.body.armedBillingSchedules,1,'Accepted milestone arms its billing schedule exactly once');
  const armedSchedule=await db.billingSchedule.findUniqueOrThrow({where:{id:milestoneSchedule.body.id}});
  assert.ok(armedSchedule.nextDueAt,'Accepted milestone must make the billing schedule due for finance draft generation');




  // Authentication regression coverage: invalid credentials must reach auth, not fail origin checks.
  const capabilities=await hit('/auth/capabilities','');
  check(capabilities,200,'Public authentication feature flags');
  assert.equal(capabilities.body.emailSignupEnabled,true);
  assert.equal(capabilities.body.developerSignup,true);
  assert.equal(capabilities.body.passwordResetEnabled,false);
  const signupEmail='ci-self-register-'+id+'@example.invalid';
  const joined=await hit('/auth/register','',{method:'POST',headers:{Origin:'http://localhost:3000'},body:JSON.stringify({name:'Standalone Email Signup',email:signupEmail,password:'CI_Only_12_Password_One!'})});
  check(joined,201,'Private preview email registration succeeds');
   assert.equal(joined.body.user,undefined,'Registration must not return an authenticated user.');
   assert.equal(joined.body.verificationRequired,false,'Disposable CI preview does not prove mailbox ownership.');
   assert.match(joined.body.notice,/two-factor verification/i);
  const independent=await db.user.findUniqueOrThrow({where:{email:signupEmail},include:{organizationMemberships:true}});
  assert.equal(independent.organizationMemberships.length,0,'Self signup never grants Seebot membership');
  check(await hit('/auth/login','',{method:'POST',headers:{Origin:'http://localhost:3000'},body:JSON.stringify({email:signupEmail,password:'incorrect-password'})}),401,'Wrong password returns authentication error');
  check(await hit('/auth/login','',{method:'POST',headers:{Origin:'https://malicious.example'},body:JSON.stringify({email:signupEmail,password:'CI_Only_12_Password_One!'})}),403,'Untrusted origin is rejected');
  const mfaLogin=await hit('/auth/login','',{method:'POST',headers:{Origin:'http://localhost:3000'},body:JSON.stringify({email:signupEmail,password:'CI_Only_12_Password_One!'})});
  check(mfaLogin,201,'Correct first-factor credentials start MFA');
  assert.equal(mfaLogin.body.mfaRequired,true);assert.match(mfaLogin.body.testCode,/^\d{6}$/);
  await db.loginChallenge.update({where:{id:mfaLogin.body.challengeId},data:{createdAt:new Date(Date.now()-31_000)}});
  const resent=await hit('/auth/mfa/resend','',{method:'POST',headers:{Origin:'http://localhost:3000'},body:JSON.stringify({challengeId:mfaLogin.body.challengeId})});
  check(resent,201,'MFA code can be securely resent after cooldown');assert.match(resent.body.testCode,/^\d{6}$/);
  check(await hit('/auth/mfa/verify','',{method:'POST',headers:{Origin:'http://localhost:3000'},body:JSON.stringify({challengeId:mfaLogin.body.challengeId,code:mfaLogin.body.testCode})}),401,'Replaced MFA code is invalidated');
  check(await hit('/auth/mfa/verify','',{method:'POST',headers:{Origin:'http://localhost:3000'},body:JSON.stringify({challengeId:resent.body.challengeId,code:resent.body.testCode})}),201,'Correct MFA code completes sign-in');
  check(await hit('/auth/mfa/verify','',{method:'POST',headers:{Origin:'http://localhost:3000'},body:JSON.stringify({challengeId:resent.body.challengeId,code:resent.body.testCode})}),401,'MFA code is single use');
  check(await hit('/auth/forgot-password','',{method:'POST',body:JSON.stringify({email:signupEmail})}),503,'Recovery requires working SMTP, not fake success');

  // A valid login must not require Seebot membership. Zero memberships enters setup.
  const standalone=await db.user.create({data:{email:'ci-unassigned-'+id+'@team-'+id+'.example',name:'Unassigned CI User',passwordHash:'NOT_REAL',role:'SALES_REP'}});
  const standaloneCookie=token(standalone,null);
  check(await hit('/auth/me',standaloneCookie),200,'Identity sign-in without a workspace');
  const emptyMemberships=await hit('/workspaces',standaloneCookie);
  check(emptyMemberships,200,'Workspace list for an unaffiliated user');
  assert.equal(emptyMemberships.body.length,0);
  check(await hit('/accounts',standaloneCookie),403,'Unaffiliated user cannot access legacy CRM');
  const createdWorkspace=await hit('/workspaces',standaloneCookie,{method:'POST',body:JSON.stringify({name:'CI New Team '+id,website:'https://team-'+id+'.example'})});
  check(createdWorkspace,201,'First-time workspace creation');
  const standaloneSelect=await hit('/workspaces/'+createdWorkspace.body.id+'/select',standaloneCookie,{method:'POST',body:'{}'});
  check(standaloneSelect,201,'New owner can select created workspace');
  assert.equal(standaloneSelect.body.crmEnabled,false);
  const owned=await hit('/workspaces',standaloneCookie);check(owned,200,'New owner workspace list');
  assert.equal(owned.body.length,1);assert.equal(owned.body[0].role,'ADMIN');
  assert.equal(owned.body[0].isCreator,true);


  // Display company names are not URL slugs. Short, Unicode and reserved names must work.
  for(const [kind,display] of [['short','AI'],['unicode','कम्पनी'],['reserved','Seebot']]){
   const slugUser=await db.user.create({data:{email:'ci-slug-'+kind+'-'+id+'@work-'+id+'.example',name:'Slug Test User',passwordHash:'NOT_REAL',role:'SALES_REP'}});
   const created=await hit('/workspaces',token(slugUser,null),{method:'POST',body:JSON.stringify({name:display})});
   check(created,201,'Company display name is not restricted by internal slug for '+kind);
   assert.equal(created.body.name,display,'Display name remains unchanged for '+kind);
   assert.match(created.body.slug,/^[a-z0-9-]{3,60}$/,'Generated slug is safe for '+kind);
   assert.notEqual(created.body.slug,'seebot','Legacy Seebot slug stays reserved');
  }

  check(await hit('/workspaces',standaloneCookie,{method:'POST',body:JSON.stringify({name:'Duplicate Company',website:'https://team-'+id+'.example'})}),403,'A workspace creator cannot create a second workspace');
  const personal=await db.user.create({data:{email:'ci-personal-'+id+'@gmail.com',name:'Personal Account',passwordHash:'NOT_REAL',role:'SALES_REP'}});
  check(await hit('/workspaces',token(personal,null),{method:'POST',body:JSON.stringify({name:'Personal Fake Company',website:'https://gmail.com'})}),400,'Personal email cannot create a company workspace');
  const mismatch=await db.user.create({data:{email:'ci-mismatch-'+id+'@legitimate-'+id+'.example',name:'Domain Mismatch',passwordHash:'NOT_REAL',role:'SALES_REP'}});
  check(await hit('/workspaces',token(mismatch,null),{method:'POST',body:JSON.stringify({name:'Wrong Domain',website:'https://unrelated-'+id+'.example'})}),400,'Company website must match creator email domain');
  check(await hit('/auth/register','',{method:'POST',body:JSON.stringify({name:'Personal Signup',email:'ci-claim-'+id+'@gmail.com',password:'CI_Only_12_Password_One!'})}),400,'Email registration blocks personal providers');

  // An invite does not grant access until redeemed by the exact recipient.
  const pendingUser=await db.user.create({data:{email:'ci-invite-'+id+'@example.invalid',name:'CI Invitee',passwordHash:'NOT_REAL',role:'SALES_REP'}});
  const pendingCookie=token(pendingUser,null);
  const invited=await hit('/workspace-invitations/organizations/'+a.org.id,a.cookie,{method:'POST',body:JSON.stringify({name:'CI Invitee',email:pendingUser.email,role:'MEMBER'})});
  check(invited,201,'Workspace administrator creates email-bound team invitation');
  assert.equal(invited.body.delivery,'NOT_SENT');
  assert.ok(invited.body.inviteUrl,'Manual link available only when real email was not delivered');
  const invitationToken=new URL(invited.body.inviteUrl).searchParams.get('token');
  assert.ok(invitationToken);
  check(await hit('/workspace-business/'+a.org.id+'/invoices',pendingCookie),403,'Invitation alone grants no tenant access');
  check(await hit('/workspace-invitations/accept-existing',b.cookie,{method:'POST',body:JSON.stringify({token:invitationToken})}),401,'Another email cannot redeem invitation');
  const accepted=await hit('/workspace-invitations/accept-existing',pendingCookie,{method:'POST',body:JSON.stringify({token:invitationToken})});
  check(accepted,201,'Verified existing identity accepts invite');
  assert.equal(accepted.body.organizationId,a.org.id);
  check(await hit('/workspace-invitations/accept-existing',pendingCookie,{method:'POST',body:JSON.stringify({token:invitationToken})}),401,'Single-use invitation cannot be redeemed twice');
  const memberCookie=token(pendingUser,a.org.id);
  check(await hit('/workspace-business/'+a.org.id+'/invoices',memberCookie),200,'Accepted invite grants selected-org membership');
  check(await hit('/workspace-business/'+b.org.id+'/invoices',memberCookie),403,'New member cannot open a foreign workspace');
  const selectedCheck=await hit('/workspaces/selected',memberCookie);
  check(selectedCheck,200,'Selected workspace is determined from the signed session');
  assert.equal(selectedCheck.body.legacyAllowed,false);

  const removed=await hit('/workspaces/'+a.org.id+'/members/'+pendingUser.id,a.cookie,{method:'PATCH',body:JSON.stringify({role:'MEMBER',status:'DISABLED'})});
  check(removed,200,'Workspace owner revokes a team membership');
  const rejectedSelection=await hit('/workspaces/selected',memberCookie);
  check(rejectedSelection,200,'Previously selected disabled membership is invalid');
  assert.equal(rejectedSelection.body.selected,null);

  const another=await hit('/workspace-invitations/organizations/'+a.org.id,a.cookie,{method:'POST',body:JSON.stringify({name:'CI Revoked Invitee',email:'ci-revoked-'+id+'@example.invalid',role:'FINANCE'})});
  check(another,201,'Owner creates revocable pending invitation');
  const revoke=await hit('/workspace-invitations/organizations/'+a.org.id+'/'+another.body.id+'/revoke',a.cookie,{method:'POST',body:'{}'});
  check(revoke,201,'Owner revokes unused invitation');
  check(await hit('/workspace-invitations/organizations/'+a.org.id+'/'+another.body.id+'/revoke',a.cookie,{method:'POST',body:'{}'}),400,'Revoked invitation cannot be revoked twice');

  check(await hit('/workspace-business/'+a.org.id+'/invoices',memberCookie),403,'Revoked member cannot access company data');


  check(await hit('/workspace-crm/'+a.org.id+'/accounts/'+b.account.id,a.cookie),400,'Foreign account hidden');
  check(await hit('/workspace-business/'+a.org.id+'/invoices/'+b.invoice.id,a.cookie),404,'Foreign invoice hidden');
  check(await hit('/workspace-business/'+a.org.id+'/dashboard',b.cookie),403,'Foreign dashboard forbidden');
  check(await hit('/workspace-business/'+b.org.id+'/contracts',a.cookie),403,'Foreign contracts forbidden');
  check(await hit('/workspace-tax/'+b.org.id+'/rules',a.cookie),403,'Foreign tax rules forbidden');
  check(await hit('/accounts',b.cookie),403,'Non-Seebot membership cannot read legacy CRM');
  check(await hit('/workspace-tax/'+a.org.id+'/invoices/'+b.invoice.id+'/apply-rule',a.cookie,{method:'POST',body:JSON.stringify({ruleId:'none',rationale:'Cross organization access must never work'})}),400,'Foreign invoice tax review denied');
  const draft=await hit('/workspace-tax/'+a.org.id+'/rules',a.cookie,{method:'POST',body:JSON.stringify({code:'CI_STANDARD_'+id.toUpperCase(),name:'Fictional CI Standard Rate',jurisdiction:'GB',treatment:'STANDARD',ratePercent:'20',invoiceNote:'Test data only'})});
  check(draft,201,'Own finance rule draft created');
  check(await hit('/workspace-tax/'+a.org.id+'/rules/'+draft.body.id+'/approve',a.cookie,{method:'POST',body:'{}'}),201,'Own finance approval');
  const applied=await hit('/workspace-tax/'+a.org.id+'/invoices/'+a.invoice.id+'/apply-rule',a.cookie,{method:'POST',body:JSON.stringify({ruleId:draft.body.id,rationale:'Fictional tax treatment reviewed for CI testing'})});
  check(applied,201,'Own finance tax invoice snapshot');
  assert.equal(applied.body.tax,'2.00');assert.equal(applied.body.total,'12.00');
  const invoice=await db.invoice.findUniqueOrThrow({where:{id:a.invoice.id},include:{taxReview:true}});
  assert.equal(invoice.total.toFixed(2),'12.00');assert.equal(invoice.taxReview.ruleCodeSnapshot,draft.body.code);assert.equal(invoice.taxReview.ratePercentSnapshot.toString(),'20');
  check(await hit('/workspace-tax/'+a.org.id+'/invoices/'+a.invoice.id+'/apply-rule',a.cookie,{method:'POST',body:JSON.stringify({ruleId:draft.body.id,rationale:'Repeated finance review must never override the stored snapshot'})}),400,'Second tax review rejected');
  check(await hit('/workspace-tax/'+b.org.id+'/rules/'+draft.body.id+'/archive',b.cookie,{method:'POST',body:'{}'}),400,'Cross-company tax-rule archive denied');
  // CI-only fictional identity; non-demo flags exercise the legally restricted issuance code against disposable data.
  await db.organization.update({where:{id:a.org.id},data:{legalName:'CI EXAMPLE ISSUER — NOT A REAL COMPANY',billingAddress:'1 Test Example Street, London'}});
  await db.account.update({where:{id:a.account.id},data:{isDemo:false,billingAddress:'2 Test Recipient Street, London'}});
  await db.invoice.update({where:{id:a.invoice.id},data:{isDemo:false}});
  check(await hit('/workspace-finance/'+a.org.id+'/invoices/'+b.invoice.id+'/approve',a.cookie,{method:'POST',body:'{}'}),400,'Foreign invoice approval is denied');
  check(await hit('/workspace-finance/'+a.org.id+'/invoices/'+a.invoice.id+'/approve',a.cookie,{method:'POST',body:'{}'}),201,'Reviewed invoice approved');
  const issuance=await hit('/workspace-finance/'+a.org.id+'/invoices/'+a.invoice.id+'/issue',a.cookie,{method:'POST',body:'{}'});
  check(issuance,201,'Approved invoice issued with PDF and accounting journal');
  assert.match(issuance.body.invoiceNumber,/^ORG-CI-1-/);
  check(await hit('/workspace-finance/'+a.org.id+'/invoices/'+a.invoice.id+'/pdf',a.cookie),200,'Issued PDF accessible to owning org');
  check(await hit('/workspace-finance/'+b.org.id+'/invoices/'+a.invoice.id+'/pdf',b.cookie),400,'Issued PDF unavailable to another org');
  check(await hit('/workspace-finance/'+a.org.id+'/invoices/'+a.invoice.id+'/record-external-send',a.cookie,{method:'POST',body:JSON.stringify({reference:'CI-ONLY-MANUAL-TEST'})}),201,'Actual external-send reference stored (no mail sent by test)');
  const partial=await hit('/workspace-finance/'+a.org.id+'/invoices/'+a.invoice.id+'/payments',a.cookie,{method:'POST',body:JSON.stringify({amount:'3.50',paidAt:'2026-10-18',reference:'CI-TEST-PARTIAL'})});
  check(partial,201,'Manually recorded partial payment with journal');assert.equal(partial.body.remainingMinor,850);
  const replay=await hit('/workspace-finance/'+a.org.id+'/invoices/'+a.invoice.id+'/payments',a.cookie,{method:'POST',body:JSON.stringify({amount:'3.50',paidAt:'2026-10-18',reference:'ci-test-partial'})});
  check(replay,400,'Case-insensitive replay of a manual bank reference is rejected');
  const afterReplay=await hit('/workspace-finance/'+a.org.id+'/invoices/'+a.invoice.id+'/payment-history',a.cookie);
  check(afterReplay,200,'Payment history after duplicate attempt');
  assert.equal(afterReplay.body.amountRemainingMinor,850);
  assert.equal(afterReplay.body.payments.length,1);
  const final=await hit('/workspace-finance/'+a.org.id+'/invoices/'+a.invoice.id+'/payments',a.cookie,{method:'POST',body:JSON.stringify({amount:'8.50',paidAt:'2026-10-18',reference:'CI-TEST-FINAL'})});
  check(final,201,'Final payment closes receivable');assert.equal(final.body.status,'PAID');assert.equal(final.body.remainingMinor,0);
  const history=await hit('/workspace-finance/'+a.org.id+'/invoices/'+a.invoice.id+'/payment-history',a.cookie);
  check(history,200,'Owner payment history');assert.equal(history.body.payments.length,2);assert.equal(history.body.amountRemainingMinor,0);
  const verified=await hit('/workspace-accounting/'+a.org.id+'/verify',a.cookie);
  check(verified,200,'Double-entry accounting validation');assert.equal(verified.body.balanced,true);
  const coverage=await hit('/workspace-accounting/'+a.org.id+'/coverage',a.cookie);
  check(coverage,200,'Invoice and payment journal coverage');assert.equal(coverage.body.complete,true);
  // A legacy Seebot manager must not see or modify new-company tasks, campaigns or reports.
  const seebot=await db.organization.upsert({where:{slug:'seebot'},create:{slug:'seebot',name:'CI legacy Seebot',status:'ACTIVE'},update:{}});
  const manager=await db.user.create({data:{email:'legacy-manager-'+id+'@example.invalid',name:'Legacy CI Manager',passwordHash:'NOT_REAL',role:'SALES_MANAGER'}});
  await db.organizationMembership.create({data:{organizationId:seebot.id,userId:manager.id,role:'ADMIN',status:'ACTIVE'}});
  const managerCookie=token(manager,seebot.id);
  const foreignOpportunity=await db.opportunity.create({data:{accountId:b.account.id,ownerId:b.user.id,title:'Confidential foreign organization opportunity',serviceLine:'Fictional security review'}});
  check(await hit('/accounts/'+b.account.id,managerCookie),400,'Seebot manager cannot open other company account by ID');
  check(await hit('/opportunities/'+foreignOpportunity.id,managerCookie),400,'Seebot manager cannot open other company opportunity by ID');
  check(await hit('/clients/'+b.account.id,managerCookie),400,'Seebot manager cannot view other company client by ID');
  const legacyAccounts=await hit('/accounts',managerCookie);
  check(legacyAccounts,200,'Seebot manager accounts list');
  assert.ok(!legacyAccounts.body.some(a=>a.id===b.account.id),'Foreign company account must not appear in Seebot manager list');
  const legacyOpportunities=await hit('/opportunities',managerCookie);
  check(legacyOpportunities,200,'Seebot manager opportunities list');
  assert.ok(!legacyOpportunities.body.some(o=>o.id===foreignOpportunity.id),'Foreign opportunity must not appear in legacy pipeline');
  const foreignTask=await db.task.create({data:{organizationId:b.org.id,title:'Other company confidential follow-up',assigneeId:b.user.id}});
  const foreignCampaign=await db.campaign.create({data:{organizationId:b.org.id,name:'Foreign confidential campaign',sector:'CI',ownerId:b.user.id}});
  const taskList=await hit('/tasks',managerCookie);check(taskList,200,'Seebot manager tasks');
  assert.ok(!taskList.body.some(t=>t.id===foreignTask.id),'Foreign task must not be listed to Seebot manager');
  check(await hit('/tasks/'+foreignTask.id,managerCookie,{method:'PATCH',body:JSON.stringify({status:'DONE'})}),400,'Foreign task mutation denied');
  const campaigns=await hit('/campaigns',managerCookie);check(campaigns,200,'Seebot manager campaigns');
  assert.ok(!campaigns.body.some(c=>c.id===foreignCampaign.id),'Foreign campaign must not be listed to Seebot manager');
  check(await hit('/campaigns/'+foreignCampaign.id+'/accounts',managerCookie,{method:'POST',body:JSON.stringify({accountId:b.account.id})}),400,'Foreign campaign enrollment denied');
  const reminders=await hit('/billing/reminders/due',managerCookie);check(reminders,200,'Seebot reminders due');
  assert.ok(!reminders.body.some(i=>i.accountId===b.account.id),'Foreign company invoices must not appear in legacy reminder queue');
  console.log('PASS: cross-tenant HTTP isolation, finance tax snapshots, invoice PDF, double-entry journal and manual payments on disposable PostgreSQL.');
 }finally{api.kill('SIGTERM');await new Promise(r=>setTimeout(r,500));}
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await db.$disconnect()});
