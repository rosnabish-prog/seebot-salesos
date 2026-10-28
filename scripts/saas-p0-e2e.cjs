/* Full synthetic tenant journey over HTTP, with real local SMTP/TLS and disposable PostgreSQL.
 * No stage/status/document/payment database shortcuts; no external provider calls. */
const assert=require('node:assert/strict');
const {spawn,execFileSync}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {SMTPServer}=require('smtp-server');
const {PrismaClient}=require('@prisma/client');
const {PDFDocument}=require('pdf-lib');
const {reachContracting}=require('./tenant-sales-journey.cjs');
if(process.env.CI!=='true'||process.env.NODE_ENV!=='test'||!process.env.DATABASE_URL?.includes('ci_only_password'))throw Error('P0 tests require the disposable CI database.');
const db=new PrismaClient(),id=randomUUID().slice(0,8),port=4201,smtpPort=4425;
const base='http://127.0.0.1:'+port+'/api',origin='https://salesos-ci.example';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'salesos-p0-'));
const mail=new Map(),password='Fictional_CI_Only_Password_123!';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let api,logs='';
function session(){return {cookies:new Map()};}
async function request(method,route,body,s,expected){
 const headers={Origin:origin,...(s?{Cookie:[...s.cookies].map(([k,v])=>k+'='+v).join('; ')}:{})};
 if(body&&!(body instanceof FormData))headers['Content-Type']='application/json';
 const response=await fetch(base+route,{method,headers,...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
 if(s)for(const cookie of response.headers.getSetCookie()){const [name,value]=cookie.split(';')[0].split('=');s.cookies.set(name,value);}
 const data=response.headers.get('content-type')?.includes('json')?await response.json():Buffer.from(await response.arrayBuffer());
 if(expected!==undefined)assert.equal(response.status,expected,method+' '+route+' '+JSON.stringify(data));
 else assert.ok(response.status>=200&&response.status<300,method+' '+route+' '+JSON.stringify(data));
 return {body:data,status:response.status,headers:response.headers};
}
const call=s=>async(method,route,body)=>(await request(method,route,body,s)).body;
function latest(email,pattern){const text=(mail.get(email)||[]).at(-1)||'';const matched=text.match(pattern);assert.ok(matched,'Expected security email was delivered to local TLS SMTP');return matched[1];}
async function register(email,name){
 const signup=await request('POST','/auth/register',{email,name,password});assert.equal(signup.body.verificationRequired,true);
 const token=latest(email,/token=([A-Za-z0-9_-]{32,100})/);
 const challenge=(await request('POST','/auth/verify-signup',{token})).body;
 assert.equal(challenge.testCode,undefined,'Production must never expose an OTP.');
 const code=latest(email,/code is ([0-9]{6})/),s=session();
 await request('POST','/auth/mfa/verify',{challengeId:challenge.challengeId,code},s);
 await request('POST','/auth/mfa/verify',{challengeId:challenge.challengeId,code},null,401);
 return {email,s,registeredAt:Date.now(),user:(await request('GET','/auth/me',null,s)).body};
}
async function select(s,orgId){await request('POST','/workspaces/'+orgId+'/select',{},s);}
async function main(){
 const cert=path.join(temp,'smtp-cert.pem'),key=path.join(temp,'smtp-key.pem');
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{stdio:'ignore'});
 const smtp=new SMTPServer({secure:false,key:fs.readFileSync(key),cert:fs.readFileSync(cert),logger:false,
  onAuth(auth,_session,cb){cb(auth.username==='ci'&&auth.password==='ci-only-smtp-password'?null:Error('Invalid SMTP credentials'),{user:'ci'});},
  onData(stream,s,cb){let text='';stream.on('data',b=>text+=b);stream.on('end',()=>{text=text.replace(/=\r?\n/g,'').replace(/=([0-9A-F]{2})/g,(_,h)=>String.fromCharCode(parseInt(h,16)));for(const r of s.envelope.rcptTo){const prior=mail.get(r.address)||[];mail.set(r.address,[...prior,text]);}cb();});}
 });
 await new Promise((resolve,reject)=>{smtp.once('error',reject);smtp.listen(smtpPort,'127.0.0.1',resolve);});
 api=spawn(process.execPath,['apps/api/dist/main.js'],{env:{...process.env,NODE_ENV:'production',API_PORT:String(port),CORS_ORIGIN:origin,TENANT_SCOPED_CRM_PRODUCTION_ENABLED:'true',TENANT_SCOPED_CRM_PREVIEW:'false',MFA_TEST_MODE:'false',MFA_CODE_SECRET:'CI_ONLY_MFA_SECRET_012345678901234567890123456789',SMTP_HOST:'127.0.0.1',SMTP_PORT:String(smtpPort),SMTP_USER:'ci',SMTP_PASSWORD:'ci-only-smtp-password',SMTP_FROM:'SalesOS <security@salesos-ci.example>',EMAIL_SIGNUP_ENABLED:'true',NODE_EXTRA_CA_CERTS:cert,DOCUMENT_STORAGE_DIR:path.join(temp,'contracts'),INVOICE_STORAGE_DIR:path.join(temp,'invoices'),CREDIT_NOTE_STORAGE_DIR:path.join(temp,'credits')},stdio:['ignore','pipe','pipe']});
 for(const stream of [api.stdout,api.stderr])stream.on('data',b=>logs=(logs+b.toString()).slice(-12000));
 try{
  let ready=false;for(let i=0;i<100;i++){if(api.exitCode!==null)throw Error(logs);try{if((await fetch('http://127.0.0.1:'+port+'/health')).ok){ready=true;break;}}catch{}await delay(200);}assert.ok(ready,logs);
  await request('POST','/auth/register',{email:'personal@gmail.com',name:'Personal',password},null,400);
  const owner=await register('owner-'+id+'@holding.example','Fictional Holding Owner');
  const a=(await request('POST','/workspaces',{name:'Fictional Alpha '+id,website:'https://alpha.example'},owner.s)).body;
  const b=(await request('POST','/workspaces',{name:'Fictional Beta '+id,website:'https://beta.example'},owner.s)).body;
  const owned=(await request('GET','/workspaces',null,owner.s)).body;assert.equal(owned.length,2);assert.ok(owned.every(o=>o.role==='OWNER'));
  await select(owner.s,a.id);const admin=call(owner.s);
  await admin('PATCH','/workspaces/'+a.id+'/profile',{legalName:'Fictional Alpha Ltd',billingAddress:'123 Fictional Avenue',services:['Customer consulting']});
  const sales=await register('sales-'+id+'@alpha.example','Fictional Salesperson');
  const finance=await register('finance-'+id+'@alpha.example','Fictional Finance');
  for(const [person,role] of [[sales,'MEMBER'],[finance,'FINANCE']]){
   const invite=await admin('POST','/workspace-invitations/organizations/'+a.id,{name:person.user.name,email:person.email,role});
   assert.equal(invite.delivery,'NOT_SENT'); // Gmail remains disabled; explicitly accept the returned private link.
   await request('POST','/workspace-invitations/accept-existing',{token:new URL(invite.inviteUrl).searchParams.get('token')},person.s);
   await select(person.s,a.id);
  }
  const rep=call(sales.s),fin=call(finance.s);
  await fin('GET','/workspace-finance-automation/'+a.id+'/billing/schedules');
  await fin('GET','/workspace-finance-automation/'+a.id+'/reminders');
  await fin('GET','/workspace-integrations/'+a.id+'/gmail/status');
  await request('POST','/workspace-business/'+a.id+'/campaigns',{name:'Forbidden',sector:'Test'},finance.s,403);
  await request('GET','/workspaces/'+a.id+'/members',null,sales.s,403);
  const account=await rep('POST','/workspace-crm/'+a.id+'/accounts',{name:'Fictional Customer '+id,website:'https://customer-'+id+'.example',industry:'Consulting'});
  const detail=await rep('GET','/workspace-crm/'+a.id+'/accounts/'+account.id),opp=detail.opportunities[0];
  await request('POST','/workspace-business/'+a.id+'/opportunities/'+opp.id+'/transition',{targetStage:'CLOSED_WON',override:true,reason:'Attempt to skip signed evidence'},owner.s,400);
  await reachContracting(rep,a.id,account.id,opp.id);
  const base='/workspace-business/'+a.id+'/opportunities/'+opp.id;
  const {contact:buyer}=await (async()=>{const d=await rep('GET','/workspace-crm/'+a.id+'/accounts/'+account.id);return {contact:d.contacts[0]};})();
  const draft=await rep('POST','/workspace-intelligence/'+a.id+'/accounts/'+account.id+'/drafts',{contactId:buyer.id,opportunityId:opp.id});
  assert.ok(draft.body.includes(a.name));assert.ok(draft.body.includes('Customer consulting'));assert.ok(!draft.body.includes('Seebot'));
  const revised=await rep('POST','/workspace-intelligence/'+a.id+'/drafts/'+draft.id+'/revise',{instruction:'shorter'});assert.ok(revised.body.includes(a.name));assert.ok(!revised.body.includes('Seebot'));
  await select(owner.s,b.id);
  await request('GET','/workspace-business/'+a.id+'/clients',null,owner.s,403); // same owner, wrong selected company
  await request('GET','/workspace-business/'+b.id+'/opportunities/'+opp.id,null,owner.s,404);
  await select(owner.s,a.id);
  async function signedContract(type){
   const c=await rep('POST',base+'/contracts',{title:'Fictional '+type,type});
   await rep('PATCH','/workspace-contracts/'+a.id+'/'+c.id+'/commercial',{committedAmount:'100.00',currency:'USD'});
   const pdf=await PDFDocument.create();pdf.addPage().drawText('Fictional CI executed agreement. No real commercial agreement.');
   const form=new FormData();form.set('kind','EXECUTED');form.set('file',new Blob([await pdf.save()],{type:'application/pdf'}),'fictional.pdf');
   const doc=await rep('POST','/workspace-contracts/'+a.id+'/'+c.id+'/documents',form);
   await request('POST','/workspace-contracts/'+a.id+'/'+c.id+'/documents/'+doc.id+'/verify',{},sales.s,403);
   await admin('POST','/workspace-contracts/'+a.id+'/'+c.id+'/documents/'+doc.id+'/verify',{});
   await admin('POST','/workspace-contracts/'+a.id+'/'+c.id+'/confirm-signed',{documentId:doc.id,signedAt:new Date().toISOString(),notes:'Fictional CI document reviewed'});
   return {c,doc};
  }
  const pilot=await signedContract('SOW');
  await rep('POST',base+'/evidence',{fields:{securityApproval:'Fictional procurement review completed'}});
  const milestone=await rep('POST','/workspace-business/'+a.id+'/clients/'+account.id+'/milestones',{title:'Fictional delivery',acceptanceCriteria:'Customer accepts fictional deliverable',contractId:pilot.c.id});
  await rep('PATCH','/workspace-business/'+a.id+'/clients/'+account.id+'/milestones/'+milestone.id,{status:'ACCEPTED',evidenceReference:'fictional-customer-acceptance-reference'});
  await rep('POST',base+'/evidence',{fields:{deliveryDate:new Date().toISOString().slice(0,10),qaResults:'Fictional acceptance criteria met',clientAcceptance:'Accepted'}});
  const production=await signedContract('PRODUCTION_OTHER');
  await rep('POST',base+'/evidence',{fields:{commercialTerms:'Fictional reviewed terms',pricingModel:'Fixed fee',handoffOwner:'Fictional Delivery Owner'}});
  const won=await rep('GET',base);assert.equal(won.stage,'CLOSED_WON');assert.equal(won.status,'CLOSED_WON');
  assert.equal((await rep('GET','/workspace-crm/'+a.id+'/accounts/'+account.id)).status,'Customer');
  const transitions=await db.stageTransition.findMany({where:{opportunityId:opp.id},orderBy:{createdAt:'asc'}});assert.equal(transitions.length,10);assert.ok(transitions.every(t=>t.automated));
  await fin('PATCH','/workspace-crm/'+a.id+'/accounts/'+account.id+'/billing',{billingAddress:'456 Fictional Customer Road'});
  const invoice=await rep('POST','/workspace-business/'+a.id+'/accounts/'+account.id+'/invoices',{contractId:production.c.id,currency:'USD',lineItems:[{description:'Fictional services',quantity:1,unitPrice:100}],subtotal:'100.00',tax:'0.00',total:'100.00',billingEmail:'billing@customer.example',dueAt:'2030-01-30'});
  const rule=await fin('POST','/workspace-tax/'+a.id+'/rules',{code:'CI_ZERO_'+id.toUpperCase(),name:'Fictional reviewed zero rate',jurisdiction:'GB',treatment:'ZERO',ratePercent:'0',invoiceNote:'Fictional CI only'});
  await fin('POST','/workspace-tax/'+a.id+'/rules/'+rule.id+'/approve',{});
  await fin('POST','/workspace-tax/'+a.id+'/invoices/'+invoice.id+'/apply-rule',{ruleId:rule.id,rationale:'Fictional zero tax treatment reviewed solely for automated testing.'});
  await request('POST','/workspace-finance/'+a.id+'/invoices/'+invoice.id+'/approve',{},sales.s,403);
  await fin('POST','/workspace-finance/'+a.id+'/invoices/'+invoice.id+'/approve',{});
  await fin('POST','/workspace-finance/'+a.id+'/invoices/'+invoice.id+'/issue',{});
  await fin('POST','/workspace-finance/'+a.id+'/invoices/'+invoice.id+'/record-external-send',{reference:'Fictional CI external delivery reference'});
  await fin('GET','/workspace-credit-notes/'+a.id+'/invoices/'+invoice.id);
  await fin('POST','/workspace-finance/'+a.id+'/invoices/'+invoice.id+'/payments',{amount:'25.00',paidAt:new Date().toISOString().slice(0,10),reference:'CI_PARTIAL_'+id});
  const paid=await fin('POST','/workspace-finance/'+a.id+'/invoices/'+invoice.id+'/payments',{amount:'75.00',paidAt:new Date().toISOString().slice(0,10),reference:'CI_FINAL_'+id});assert.equal(paid.status,'PAID');
  assert.equal((await fin('GET','/workspace-accounting/'+a.id+'/coverage')).complete,true);
  await select(owner.s,b.id);
  for(const [route,status] of [['/workspace-contracts/'+b.id+'/documents/'+production.doc.id+'/download',400],['/workspace-finance/'+b.id+'/invoices/'+invoice.id+'/pdf',400],['/workspace-client-success/'+b.id+'/clients/'+account.id+'/reports',404]])await request('GET',route,null,owner.s,status);
  await select(owner.s,a.id);
  // Offline recovery enrollment uses an actual email OTP, even in production mode.
  const enrollment=await admin('POST','/auth/mfa/recovery/start',{}),enrollmentCode=latest(owner.email,/code is ([0-9]{6})/);
  await request('POST','/auth/mfa/verify',{challengeId:enrollment.challengeId,code:enrollmentCode},null,401); // wrong challenge purpose
  const recovery=await admin('POST','/auth/mfa/recovery-codes',{challengeId:enrollment.challengeId,code:enrollmentCode});assert.equal(recovery.codes.length,8);
  const oldCookies=new Map(owner.s.cookies);
  await delay(Math.max(0,31_000-(Date.now()-owner.registeredAt)));
  const challenge=await request('POST','/auth/login',{email:owner.email,password});
  await request('POST','/auth/mfa/recovery/verify',{challengeId:challenge.body.challengeId,code:recovery.codes[0]},owner.s);
  await request('GET','/auth/me',null,{cookies:oldCookies},401);
  await request('POST','/auth/mfa/recovery/verify',{challengeId:challenge.body.challengeId,code:recovery.codes[0]},null,401);
  assert.equal((await admin('GET','/auth/mfa/recovery/status')).remaining,7);
  // Two independent service instances share the exact same atomic database counter.
  const {AuthRateLimitService}=require('../apps/api/dist/auth/auth-rate-limit.service');
  const limiters=[new AuthRateLimitService(db),new AuthRateLimitService(db)];
  const attempts=await Promise.allSettled(Array.from({length:12},(_,i)=>limiters[i%2].consume('ci-distributed',id,3,60000)));
  assert.equal(attempts.filter(a=>a.status==='fulfilled').length,3);assert.ok(attempts.filter(a=>a.status==='rejected').every(a=>a.reason.getStatus()===429));
  await select(owner.s,a.id);
  const {OutgoingMessageService}=require('../apps/api/dist/communications/outgoing-message.service');
  const {WorkspaceAccessService}=require('../apps/api/dist/workspace/workspace-access.service');
  let providerCalls=0;const outbox=new OutgoingMessageService(db,{send:async()=>{providerCalls++;return 'not-used';}},{},new WorkspaceAccessService(db));
  const queued=await outbox.draft(sales.user.id,{organizationId:a.id,entityType:'OUTREACH_DRAFT',entityId:draft.id,category:'SALES_OUTREACH',recipientEmail:buyer.email,subject:'Fictional queued message',bodyText:'Fictional queued body',idempotencyKey:'ci-revocation:'+id});
  await admin('PATCH','/workspaces/'+a.id+'/members/'+sales.user.id,{role:'MEMBER',status:'DISABLED'});
  await request('GET',base,null,sales.s,403);
  await assert.rejects(outbox.send(queued.id,sales.user.id),e=>e.getStatus()===403);assert.equal(providerCalls,0,'Revocation is checked before contacting Gmail');
  await admin('POST','/workspaces/'+a.id+'/transfer-ownership',{userId:finance.user.id});
  await request('POST','/workspaces/'+a.id+'/transfer-ownership',{userId:owner.user.id},owner.s,403);
  console.log('PASS: multi-organization ownership, company email, SMTP verification/MFA, all 11 sales stages, documents, finance payments, tenant/role isolation, recovery replay/session revocation and distributed rate limits.');
 }catch(error){await delay(150);console.error(logs.slice(-6000));throw error;}
 finally{api?.kill('SIGTERM');await new Promise(resolve=>smtp.close(resolve));await db.$disconnect();fs.rmSync(temp,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
