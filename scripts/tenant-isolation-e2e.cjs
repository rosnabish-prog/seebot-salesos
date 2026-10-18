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
  console.log('PASS: 10 cross-tenant and legacy-gate HTTP checks against disposable PostgreSQL.');
 }finally{api.kill('SIGTERM');await new Promise(r=>setTimeout(r,500));}
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await db.$disconnect()});
