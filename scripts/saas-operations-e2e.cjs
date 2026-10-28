/* Operational boundaries against disposable native PostgreSQL; no external services. */
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{spawn}=require('node:child_process');
const {PrismaClient}=require('@prisma/client'),{JwtService}=require('@nestjs/jwt');
if(process.env.CI!=='true'||process.env.NODE_ENV!=='test'||!process.env.DATABASE_URL?.includes('ci_only_password'))throw Error('Operations tests require the disposable CI database.');
const db=new PrismaClient(),id=randomUUID().slice(0,8),port=4202,origin='https://operations-ci.example';
const jwt=new JwtService({secret:process.env.JWT_SECRET});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let api,logs='';
async function identity(user,orgId,authAt=Date.now()){
 const session=await jwt.signAsync({sub:user.id,pv:user.passwordVersion,mfa:true,authAt},{expiresIn:'1h'});
 const workspace=await jwt.signAsync({kind:'workspace',sub:user.id,wid:orgId},{expiresIn:'1h'});
 return 'salesos_session='+session+'; salesos_workspace='+workspace;
}
async function call(cookie,method,route,body,status=200){
 const res=await fetch('http://127.0.0.1:'+port+'/api'+route,{method,headers:{Origin:origin,Cookie:cookie,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});
 const data=await res.json();assert.equal(res.status,status,method+' '+route+' '+JSON.stringify(data));return data;
}
async function main(){
 const owner=await db.user.create({data:{email:'ops-owner-'+id+'@holding.example',name:'Operations Owner',passwordHash:'CI_NOT_A_LOGIN_HASH'}});
 const member=await db.user.create({data:{email:'ops-member-'+id+'@alpha.example',name:'Operations Member',passwordHash:'CI_NOT_A_LOGIN_HASH'}});
 const a=await db.organization.create({data:{name:'Operations Alpha',slug:'ops-alpha-'+id,status:'ACTIVE',createdById:owner.id,memberships:{create:[{userId:owner.id,role:'OWNER'},{userId:member.id,role:'MEMBER'}]}}});
 const b=await db.organization.create({data:{name:'Operations Beta',slug:'ops-beta-'+id,status:'ACTIVE',createdById:owner.id,memberships:{create:{userId:owner.id,role:'OWNER'}}}});
 const account=await db.account.create({data:{organizationId:a.id,name:'Fictional customer',domain:'ops-'+id+'.example',website:'https://customer.example',industry:'Test',hypothesis:'Synthetic operations fixture',ownerId:owner.id,contacts:{create:{name:'Billing',title:'Billing',source:'CI',email:'billing@customer.example'}}}});
 await db.account.create({data:{organizationId:a.id,name:'Second customer',domain:'second-'+id+'.example',website:'https://second.example',industry:'Test',hypothesis:'Pagination fixture',ownerId:owner.id}});
 const foreign=await db.account.create({data:{organizationId:b.id,name:'PRIVATE BETA',domain:'foreign-'+id+'.example',website:'https://foreign.example',industry:'Test',hypothesis:'Foreign fixture',ownerId:owner.id}});
 const opportunity=await db.opportunity.create({data:{accountId:account.id,title:'Fixture agreement',ownerId:owner.id,serviceLine:'Consulting'}});
 const contract=await db.contract.create({data:{opportunityId:opportunity.id,title:'Signed fixture',type:'SOW',status:'SIGNED'}});
 const due=new Date(Date.now()-7*86400000);
 const schedule=await db.billingSchedule.create({data:{contractId:contract.id,description:'Fictional recurring services',cadence:'ONE_TIME',amount:'100',currency:'USD',nextDueAt:due,createdById:owner.id}});
 const invoice=await db.invoice.create({data:{accountId:account.id,number:'OPS-'+id,status:'SENT',currency:'USD',subtotal:100,total:100,billingEmail:'billing@customer.example',dueAt:due,createdById:owner.id}});
 await db.workspaceInvitation.create({data:{organizationId:a.id,email:'pending@alpha.example',name:'Pending',tokenHash:'ops-'+id,expiresAt:new Date(Date.now()+86400000),createdById:owner.id}});
 api=spawn(process.execPath,['apps/api/dist/main.js'],{env:{...process.env,NODE_ENV:'production',API_PORT:String(port),CORS_ORIGIN:origin,TENANT_SCOPED_CRM_PRODUCTION_ENABLED:'true',MFA_CODE_SECRET:'CI_ONLY_OPERATIONS_SECRET_01234567890123456789'},stdio:['ignore','pipe','pipe']});
 for(const stream of [api.stdout,api.stderr])stream.on('data',b=>logs=(logs+b.toString()).slice(-10000));
 try{
  let ready=false;for(let n=0;n<100;n++){if(api.exitCode!==null)throw Error(logs);try{if((await fetch('http://127.0.0.1:'+port+'/ready')).ok){ready=true;break;}}catch{}await delay(150);}assert.ok(ready,logs);
  const auth=await identity(owner,a.id),rep=await identity(member,a.id),wrong=await identity(owner,b.id),stale=await identity(owner,a.id,Date.now()-6*60_000);
  const manifest=await call(auth,'GET','/workspace-exports/'+a.id);assert.ok(manifest.resources.includes('invoices'));
  await call(rep,'GET','/workspace-exports/'+a.id,undefined,403);
  await call(wrong,'GET','/workspace-exports/'+a.id+'/accounts',undefined,403);
  const first=await call(auth,'GET','/workspace-exports/'+a.id+'/accounts?limit=1');assert.equal(first.data.length,1);assert.ok(first.next);
  const second=await call(auth,'GET','/workspace-exports/'+a.id+'/accounts?limit=1&after='+first.next);assert.equal(second.data.length,1);assert.equal(second.next,null);assert.notEqual(second.data[0].id,first.data[0].id);
  for(const resource of manifest.resources){const page=await call(auth,'GET','/workspace-exports/'+a.id+'/'+resource);const json=JSON.stringify(page);assert.ok(!json.includes(foreign.id));assert.ok(!/passwordHash|tokenHash|refreshToken|storageKey/.test(json));}
  await call(auth,'GET','/workspace-exports/'+a.id+'/accounts?limit=101',undefined,400);
  await call(rep,'PATCH','/workspace-operations/'+a.id,{billingDrafts:true,reminderTasks:true},403);
  await call(auth,'PATCH','/workspace-operations/'+a.id,{billingDrafts:true,reminderTasks:true});
  const {FinancePreparationService}=require('../apps/api/dist/operations/finance-preparation.service');
  const {BackgroundJobsService}=require('../apps/api/dist/operations/background-jobs.service');
  const finance=new FinancePreparationService(db),queues=[new BackgroundJobsService(db,finance),new BackgroundJobsService(db,finance)];
  // Concurrent replicas enqueue/claim once. Expired leases get a new fencing token.
  const key='ops-claim:'+id;await Promise.all(queues.map(q=>q.enqueue('BILLING_DRAFTS',key,a.id)));
  const claimed=await Promise.all(queues.map(q=>q.claim()));assert.equal(claimed.filter(Boolean).length,1);
  const original=claimed.find(Boolean);await db.backgroundJob.update({where:{id:original.id},data:{leaseUntil:new Date(0)}});
  const reclaimed=await queues[1].claim();assert.equal(reclaimed.id,original.id);assert.notEqual(reclaimed.leaseToken,original.leaseToken);
  const staleCompletion=await db.backgroundJob.updateMany({where:{id:original.id,leaseToken:original.leaseToken},data:{status:'SUCCEEDED'}});assert.equal(staleCompletion.count,0);
  await db.backgroundJob.update({where:{id:reclaimed.id},data:{status:'PENDING',leaseToken:null,leaseUntil:null}});
  await queues[0].runOne();assert.equal(await db.invoice.count({where:{contractId:contract.id,status:'DRAFT'}}),1);
  await queues[0].enqueue('BILLING_DRAFTS','ops-repeat:'+id,a.id);await queues[0].runOne();assert.equal(await db.invoice.count({where:{contractId:contract.id}}),1);
  assert.equal((await db.billingSchedule.findUnique({where:{id:schedule.id}})).status,'PAUSED');
  await queues[0].enqueue('REMINDER_TASKS','ops-reminder:'+id,a.id);await queues[0].runOne();
  assert.equal(await db.invoiceReminder.count({where:{invoiceId:invoice.id,status:'PENDING_APPROVAL'}}),2);
  assert.equal(await db.task.count({where:{organizationId:a.id}}),2);
  await queues[0].enqueue('REMINDER_TASKS','ops-reminder-repeat:'+id,a.id);await queues[0].runOne();assert.equal(await db.task.count({where:{organizationId:a.id}}),2);
  assert.equal(await db.outgoingMessage.count({where:{organizationId:a.id}}),0,'Preparation must not send or queue email');
  await call(stale,'POST','/workspace-lifecycle/'+a.id+'/status',{status:'SUSPENDED',confirmation:a.slug},403);
  await call(rep,'POST','/workspace-lifecycle/'+a.id+'/status',{status:'SUSPENDED',confirmation:a.slug},403);
  await call(auth,'POST','/workspace-lifecycle/'+a.id+'/status',{status:'SUSPENDED',confirmation:a.slug},201);
  await call(auth,'GET','/workspace-business/'+a.id+'/clients',undefined,403);
  await call(rep,'POST','/workspace-lifecycle/'+a.id+'/status',{status:'ACTIVE',confirmation:a.slug},403);
  assert.equal((await db.workspaceInvitation.findFirst({where:{organizationId:a.id}})).status,'REVOKED');
  const listed=await call(auth,'GET','/workspaces');assert.ok(listed.some(w=>w.id===a.id&&w.status==='SUSPENDED'));
  const suspendedJob=await queues[0].enqueue('BILLING_DRAFTS','ops-suspended:'+id,a.id);await queues[0].runOne();assert.equal((await db.backgroundJob.findUnique({where:{id:suspendedJob.id}})).status,'CANCELLED');
  await assert.rejects(finance.billing(a.id,owner.id),e=>e.getStatus()===403); // empty batch also checks access
  await call(auth,'POST','/workspace-lifecycle/'+a.id+'/status',{status:'ACTIVE',confirmation:a.slug},201);
  await call(auth,'GET','/workspace-business/'+a.id+'/clients');
  // Operator suspensions are distinct: owners cannot reactivate them.
  await db.organization.update({where:{id:a.id},data:{status:'SUSPENDED',suspendedFromStatus:null}});
  await call(auth,'POST','/workspace-lifecycle/'+a.id+'/status',{status:'ACTIVE',confirmation:a.slug},403);
  await db.organization.update({where:{id:a.id},data:{status:'ACTIVE'}});
  // Removed initiators cannot cause new preparation; failures are visible and retryable.
  await db.organizationMembership.update({where:{organizationId_userId:{organizationId:a.id,userId:owner.id}},data:{status:'DISABLED'}});
  const revoked=await queues[0].enqueue('REMINDER_TASKS','ops-revoked:'+id,a.id);await queues[0].runOne();assert.equal((await db.backgroundJob.findUnique({where:{id:revoked.id}})).status,'FAILED');
  await db.organizationMembership.update({where:{organizationId_userId:{organizationId:a.id,userId:owner.id}},data:{status:'ACTIVE'}});
  await call(wrong,'POST','/workspace-operations/'+b.id+'/jobs/'+revoked.id+'/retry',{},400);
  await call(auth,'POST','/workspace-operations/'+a.id+'/jobs/'+revoked.id+'/retry',{},201);await queues[0].runOne();
  // Daily cleanup preserves current counters and all financial/audit records.
  await db.authRateLimit.createMany({data:[{key:'ops-expired-'+id,count:1,expiresAt:new Date(Date.now()-9*86400000)},{key:'ops-current-'+id,count:1,expiresAt:new Date(Date.now()+86400000)}]});
  await queues[0].enqueue('MAINTENANCE','ops-maintenance:'+id,null);await queues[0].runOne();
  assert.equal(await db.authRateLimit.count({where:{key:'ops-expired-'+id}}),0);assert.equal(await db.authRateLimit.count({where:{key:'ops-current-'+id}}),1);
  assert.equal(await db.invoice.count({where:{id:invoice.id}}),1);
  console.log('PASS: exports/roles/pagination, owner suspension/reactivation, durable queue concurrency/leases/idempotency/revocation/retry, draft-only preparation and retention.');
 }catch(e){console.error(logs.slice(-5000));throw e;}finally{api?.kill('SIGTERM');await db.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
