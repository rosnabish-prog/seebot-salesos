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
function token(user,orgId){
 const s=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const body=s({sub:user.id,pv:user.passwordVersion,wid:orgId,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+1800});
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
 const api=spawn(process.execPath,['apps/api/dist/main.js'],{cwd:process.cwd(),env:{...process.env,API_PORT:String(port),TENANT_SCOPED_CRM_PREVIEW:'true',SIGNING_ENABLED:'false',GMAIL_SENDING_ENABLED:'false'},stdio:['ignore','pipe','pipe']});
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
  check(await hit('/workspace-business/'+a.org.id+'/invoices/'+a.invoice.id,a.cookie),200,'Own invoice');
  check(await hit('/workspace-tax/'+a.org.id+'/rules',a.cookie),200,'Own finance rules');
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
