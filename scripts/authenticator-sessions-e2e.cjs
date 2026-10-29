/* Account security against disposable native PostgreSQL. Test email codes never leave this process. */
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{spawn}=require('node:child_process');
const {PrismaClient}=require('@prisma/client'),{JwtService}=require('@nestjs/jwt'),argon2=require('argon2');
if(process.env.CI!=='true'||process.env.NODE_ENV!=='test'||!process.env.DATABASE_URL?.includes('ci_only_password'))throw Error('Account security tests require the disposable CI database.');
const db=new PrismaClient(),jwt=new JwtService({secret:process.env.JWT_SECRET}),id=randomUUID().slice(0,8),port=4203;
const password='Fictional_Security_Test_Password_123!',origin='http://localhost:3000',base='http://127.0.0.1:'+port;
const {AuthSessionService}=require('../apps/api/dist/auth/auth-session.service');
const {totpCode}=require('../apps/api/dist/auth/totp');
const issuer=new AuthSessionService(db,jwt),delay=ms=>new Promise(r=>setTimeout(r,ms));
let api,logs='';
const jar=()=>new Map();
async function request(cookies,method,path,body,status=200){
 const res=await fetch(base+'/api'+path,{method,headers:{Origin:origin,Cookie:[...cookies].map(([k,v])=>k+'='+v).join('; '),'User-Agent':'Security integration browser',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});
 for(const raw of res.headers.getSetCookie()){const [name,value]=raw.split(';')[0].split('=');cookies.set(name,value);}
 const data=await res.json();assert.equal(res.status,status,method+' '+path+' '+JSON.stringify(data));return {data,headers:res.headers};
}
const post=async(c,path,body={},status=201)=>(await request(c,'POST',path,body,status)).data;
const get=async(c,path,status=200)=>(await request(c,'GET',path,undefined,status)).data;
async function fixtureSession(user,authAt=Date.now()){
 const current=await db.user.findUniqueOrThrow({where:{id:user.id}}),c=jar();
 c.set('salesos_session',await issuer.create(current,{headers:{'user-agent':'Secondary synthetic session fixture'}},'EMAIL',authAt));return c;
}
async function emailLogin(user){const c=jar(),started=Date.now(),challenge=await post(c,'/auth/login',{email:user.email,password});assert.equal(challenge.method,'EMAIL');await post(c,'/auth/mfa/verify',{challengeId:challenge.challengeId,code:challenge.testCode});return {c,started};}
async function enroll(c){
 const start=await post(c,'/auth/mfa/authenticator/start');
 await post(jar(),'/auth/mfa/verify',{challengeId:start.challengeId,code:start.testCode},401);
 const response=await request(c,'POST','/auth/mfa/authenticator/enroll',{challengeId:start.challengeId,code:start.testCode},201),setup=response.data;
 assert.equal(response.headers.get('cache-control'),'no-store');assert.match(setup.secret,/^[A-Z2-7]{32}$/);assert.match(setup.qrCode,/^data:image\/png;base64,/);
 assert.equal((await get(c,'/auth/mfa/authenticator')).enabled,false);
 const before=new Map(c),step=Math.floor(Date.now()/30000);
 await post(c,'/auth/mfa/authenticator/confirm',{enrollmentId:setup.enrollmentId,code:'invalid'},401);
 await post(c,'/auth/mfa/authenticator/confirm',{enrollmentId:setup.enrollmentId,code:totpCode(setup.secret,step)});
 await get(before,'/auth/me',401);assert.equal((await get(c,'/auth/mfa/authenticator')).enabled,true);
 return setup;
}
async function main(){
 const hash=await argon2.hash(password);
 const owner=await db.user.create({data:{email:'security-owner-'+id+'@holding.example',name:'Security Owner',passwordHash:hash}});
 const other=await db.user.create({data:{email:'security-other-'+id+'@other.example',name:'Unrelated User',passwordHash:hash}});
 const normal=await db.user.create({data:{email:'security-normal-'+id+'@normal.example',name:'Normal factor removal',passwordHash:hash}});
 const exhausted=await db.user.create({data:{email:'security-exhausted-'+id+'@exhausted.example',name:'Setup attempts',passwordHash:hash}});
 for(const n of [1,2])await db.organization.create({data:{slug:'security-'+id+'-'+n,name:'Independent security organization '+n,memberships:{create:{userId:owner.id,role:'OWNER'}}}});
 api=spawn(process.execPath,['apps/api/dist/main.js'],{env:{...process.env,API_PORT:String(port),MFA_TEST_MODE:'true',MFA_ENCRYPTION_KEY:Buffer.alloc(32,0x43).toString('base64'),CORS_ORIGIN:origin},stdio:['ignore','pipe','pipe']});
 for(const stream of [api.stdout,api.stderr])stream.on('data',b=>logs=(logs+b.toString()).slice(-9000));
 try{
  let ready=false;for(let n=0;n<100;n++){if(api.exitCode!==null)throw Error(logs);try{if((await fetch(base+'/ready')).ok){ready=true;break;}}catch{}await delay(150);}assert.ok(ready,logs);
  const login=await emailLogin(owner),a=login.c,authAt=(await jwt.verifyAsync(a.get('salesos_session'))).authAt;
  const b=await fixtureSession(owner),foreign=await fixtureSession(other);
  const mine=await get(a,'/auth/sessions'),foreignId=(await get(foreign,'/auth/sessions')).sessions[0].id;
  assert.equal(mine.sessions.length,2);assert.equal(mine.sessions.filter(s=>s.current).length,1);assert.ok(!JSON.stringify(mine).includes(foreignId));
  await request(a,'DELETE','/auth/sessions/'+foreignId,undefined,404);
  const stale=await fixtureSession(owner,Date.now()-6*60000);
  await post(stale,'/auth/sessions/revoke-others',{},403);await post(stale,'/auth/mfa/authenticator/start',{},403);
  await post(a,'/auth/sessions/revoke-others');await get(b,'/auth/me',401);await get(stale,'/auth/me',401);await get(foreign,'/auth/me');
  assert.equal((await jwt.verifyAsync(a.get('salesos_session'))).authAt,authAt,'Revocation cannot extend seven-day authentication age.');
  const legacy=jar();legacy.set('salesos_session',await jwt.signAsync({sub:owner.id,pv:(await db.user.findUnique({where:{id:owner.id}})).passwordVersion,mfa:true,authAt},{expiresIn:'1h'}));await get(legacy,'/auth/me',401);
  const loggedOut=await fixtureSession(owner),copied=new Map(loggedOut);await post(loggedOut,'/auth/logout');await get(copied,'/auth/me',401);
  const individual=await fixtureSession(owner),individualId=(await get(individual,'/auth/sessions')).sessions.find(s=>s.current).id;
  await request(a,'DELETE','/auth/sessions/'+individualId);await get(individual,'/auth/me',401);
  const recoveryStart=await post(a,'/auth/mfa/recovery/start'),recovery=await post(a,'/auth/mfa/recovery-codes',{challengeId:recoveryStart.challengeId,code:recoveryStart.testCode});
  assert.equal(recovery.codes.length,8);
  const pendingSession=await fixtureSession(owner),setup=await enroll(a);
  await get(pendingSession,'/auth/me',401);
  const stored=await db.userAuthenticator.findUnique({where:{userId:owner.id}});assert.ok(!stored.secretEncrypted.includes(setup.secret));
  assert.equal((await jwt.verifyAsync(a.get('salesos_session'))).authAt,authAt);
  const enrolledStatus=await get(a,'/auth/mfa/authenticator');assert.ok(!JSON.stringify(enrolledStatus).includes(setup.secret));
  await delay(Math.max(0,31000-(Date.now()-login.started),(stored.lastStep+1)*30000-Date.now()+100));
  const totpLogin=await post(jar(),'/auth/login',{email:owner.email,password});assert.equal(totpLogin.method,'TOTP');assert.equal(totpLogin.testCode,undefined);
  await post(jar(),'/auth/mfa/resend',{challengeId:totpLogin.challengeId},400);
  await post(jar(),'/auth/mfa/verify',{challengeId:totpLogin.challengeId,code:'bad'},401);
  const signedIn=jar(),currentCode=totpCode(setup.secret,Math.floor(Date.now()/30000));
  await post(signedIn,'/auth/mfa/verify',{challengeId:totpLogin.challengeId,code:currentCode});
  await post(jar(),'/auth/mfa/verify',{challengeId:totpLogin.challengeId,code:currentCode},401);
  // Concurrent challenges stand in for first factors already proven on two replicas.
  const latest=await db.user.findUniqueOrThrow({where:{id:owner.id}});
  const challenges=await Promise.all([1,2].map(()=>db.loginChallenge.create({data:{userId:owner.id,passwordVersion:latest.passwordVersion,purpose:'LOGIN',method:'TOTP',codeHash:'unused-for-totp',expiresAt:new Date(Date.now()+60000)}})));
  const futureCode=totpCode(setup.secret,Math.floor(Date.now()/30000)+1);
  const concurrent=await Promise.all(challenges.map(ch=>fetch(base+'/api/auth/mfa/verify',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({challengeId:ch.id,code:futureCode})}).then(r=>r.status)));
  assert.deepEqual(concurrent.sort(),[201,401],'One authenticator time step can only complete one concurrent challenge.');
  // Enabled users prove their existing authenticator when rotating recovery codes.
  const rotate=await post(signedIn,'/auth/mfa/recovery/start');assert.equal(rotate.method,'TOTP');assert.equal(rotate.testCode,undefined);
  await post(signedIn,'/auth/mfa/recovery-codes',{challengeId:rotate.challengeId,code:'bad'},401);
  // Recovery can restore access to remove a lost device without an email-only login downgrade.
  await delay(31000);
  const recoverChallenge=await post(jar(),'/auth/login',{email:owner.email,password}),recovered=jar();
  await post(recovered,'/auth/mfa/recovery/verify',{challengeId:recoverChallenge.challengeId,code:recovery.codes[0]});
  await get(signedIn,'/auth/me',401);assert.equal((await get(recovered,'/auth/mfa/authenticator')).recoverySession,true);
  await post(jar(),'/auth/mfa/recovery/verify',{challengeId:recoverChallenge.challengeId,code:recovery.codes[0]},401);
  const removal=await post(recovered,'/auth/mfa/authenticator/disable/start');
  await post(recovered,'/auth/mfa/authenticator/disable',{challengeId:removal.challengeId,emailCode:removal.testCode});assert.equal((await get(recovered,'/auth/mfa/authenticator')).enabled,false);
  assert.equal((await get(recovered,'/workspaces')).length,2,'Factor changes preserve multiple owned organizations.');
  // Normal removal requires both fresh email proof and a new authenticator code.
  const normalCookie=await fixtureSession(normal),normalSetup=await enroll(normalCookie),normalRemoval=await post(normalCookie,'/auth/mfa/authenticator/disable/start');
  await post(normalCookie,'/auth/mfa/authenticator/disable',{challengeId:normalRemoval.challengeId,emailCode:normalRemoval.testCode,totpCode:totpCode(normalSetup.secret,Math.max((await db.userAuthenticator.findUnique({where:{userId:normal.id}})).lastStep+1,Math.floor(Date.now()/30000)))});
  assert.equal((await get(normalCookie,'/auth/mfa/authenticator')).enabled,false);
  const limitCookie=await fixtureSession(exhausted),limitStart=await post(limitCookie,'/auth/mfa/authenticator/start');
  const limitSetup=await post(limitCookie,'/auth/mfa/authenticator/enroll',{challengeId:limitStart.challengeId,code:limitStart.testCode});
  for(let n=0;n<5;n++)await post(limitCookie,'/auth/mfa/authenticator/confirm',{enrollmentId:limitSetup.enrollmentId,code:'bad'},401);
  await post(limitCookie,'/auth/mfa/authenticator/confirm',{enrollmentId:limitSetup.enrollmentId,code:totpCode(limitSetup.secret,Math.floor(Date.now()/30000))},401);
  assert.equal((await get(limitCookie,'/auth/mfa/authenticator')).enabled,false);
  // Dry-run/apply rotation covers both active and pending secrets without changing MFA replay state.
  const {sealTotp,openTotp}=require('../apps/api/dist/auth/totp');
  const {rotateAuthenticatorKeys}=require('../apps/api/dist/auth/rotate-authenticator-keys');
  const rotating=await db.user.create({data:{email:'security-rotation-'+id+'@rotation.example',name:'Rotation fixture',passwordHash:hash}});
  const names=['MFA_ENCRYPTION_KEY','MFA_ENCRYPTION_KEYS','MFA_ENCRYPTION_ACTIVE_KEY_ID'],prior=names.map(n=>process.env[n]);
  try{
   process.env.MFA_ENCRYPTION_KEY=Buffer.alloc(32,0x43).toString('base64');delete process.env.MFA_ENCRYPTION_KEYS;delete process.env.MFA_ENCRYPTION_ACTIVE_KEY_ID;
   const secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',encrypted=sealTotp(rotating.id,secret);
   await db.userAuthenticator.create({data:{userId:rotating.id,secretEncrypted:encrypted,lastStep:1234}});
   await db.authenticatorEnrollment.create({data:{userId:rotating.id,secretEncrypted:encrypted,passwordVersion:1,expiresAt:new Date(Date.now()+60000)}});
   process.env.MFA_ENCRYPTION_KEYS=JSON.stringify({next:Buffer.alloc(32,0x44).toString('base64')});process.env.MFA_ENCRYPTION_ACTIVE_KEY_ID='next';
   const dry=await rotateAuthenticatorKeys(db,false,rotating.id);assert.equal(dry.secretsToRotate,2);assert.equal(dry.secretsRotated,0);
   assert.equal((await db.userAuthenticator.findUnique({where:{userId:rotating.id}})).secretEncrypted,encrypted);
   const applied=await rotateAuthenticatorKeys(db,true,rotating.id);assert.equal(applied.secretsRotated,2);
   delete process.env.MFA_ENCRYPTION_KEY;
   const after=await db.userAuthenticator.findUnique({where:{userId:rotating.id}});assert.equal(after.lastStep,1234);assert.equal(openTotp(rotating.id,after.secretEncrypted),secret);
   assert.equal(openTotp(rotating.id,(await db.authenticatorEnrollment.findUnique({where:{userId:rotating.id}})).secretEncrypted),secret);
   assert.equal((await rotateAuthenticatorKeys(db,true,rotating.id)).secretsRotated,0);
  }finally{names.forEach((name,i)=>prior[i]===undefined?delete process.env[name]:process.env[name]=prior[i]);}
  console.log('PASS: registered sessions, logout/revocation/foreign-ID/legacy/stale checks, secure QR enrollment, TOTP sign-in/replay/concurrency, recovery rotation and lost-device/normal removal.');
 }catch(e){console.error(logs.slice(-5000));throw e;}finally{api?.kill('SIGTERM');await db.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
