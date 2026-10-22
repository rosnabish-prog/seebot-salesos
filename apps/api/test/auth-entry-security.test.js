const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const api=file=>fs.readFileSync(path.join(__dirname,'../src',file),'utf8');
const web=file=>fs.readFileSync(path.join(__dirname,'../../web',file),'utf8');

test('signup and verified signup cannot issue a session before MFA',()=>{
 const controller=api('auth/auth.controller.ts');
 const register=controller.slice(controller.indexOf("@Post('register')"),controller.indexOf("@Post('forgot-password')"));
 assert.match(register,/clearAuthCookies\(res\)/);
 assert.match(register,/return this\.mfa\.begin/);
 assert.doesNotMatch(register,/this\.issueSession\(res/);
 const signup=api('auth/account-recovery.service.ts');
 assert.match(signup,/this\.ciDisposableSignupReady\(\)/);
 assert.match(signup,/includes\('ci_only_password'\)/);
 assert.match(signup,/verificationRequired:false,preview:true/);
 const verifyPage=web('app/verify-email/page.tsx');
 assert.match(verifyPage,/\/two-factor/);
 assert.doesNotMatch(verifyPage,/\/entry/);
});
test('every invite entry requires full MFA (or preserves existing verified session)',()=>{
 const legacy=api('organizations/employee-invitation.controller.ts');
 const newTenant=api('workspace/workspace-invitations.controller.ts');
 assert.match(legacy,/return this\.mfa\.begin/);
 assert.match(newTenant,/this\.mfa\.begin\(/);
 assert.doesNotMatch(legacy,/res\.cookie\('salesos_session'/);
 assert.doesNotMatch(newTenant,/res\.cookie\('salesos_session'/);
 assert.match(web('app/accept-invite/page.tsx'),/\/two-factor/);
 assert.match(web('app/join-workspace/page.tsx'),/\/two-factor/);
});
test('MFA guesses are atomically counted and password changes revoke pending codes',()=>{
 const code=api('auth/mfa.service.ts');
 assert.match(code,/attempts:\{lt:5\}/);
 assert.match(code,/updateMany\(\{[\s\S]*?attempts:\{increment:1\}/);
 assert.match(code,/timingSafeEqual/);
 for(const path of ['auth/account-recovery.service.ts','auth/auth.service.ts']){
  assert.match(api(path),/loginChallenge\.updateMany/);
 }
});
test('direct unverified employee credential provisioning is blocked in production',()=>{
 const src=api('users/users.controller.ts');
 assert.match(src,/process\.env\.NODE_ENV==='production'/);
 assert.match(src,/ALLOW_DIRECT_USER_PROVISIONING/);
 const settings=web('app/(workspace)/settings/page.tsx');
 assert.match(settings,/Invite employee/);
 assert.doesNotMatch(settings,/Create Employee Account/);
});
