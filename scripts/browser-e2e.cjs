/* Headless browser smoke using disposable CI-only PostgreSQL and fictional records. */
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
const {randomUUID,randomBytes,createHash}=require('node:crypto');
const {PrismaClient}=require('@prisma/client');
const argon2=require('argon2');
const {chromium}=require('playwright');

if(process.env.CI!=='true'||process.env.NODE_ENV!=='test'||!process.env.DATABASE_URL?.includes('ci_only_password'))
 throw Error('Browser smoke must run only against the disposable CI database.');

const db=new PrismaClient();
const children=[];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const previewDir=path.resolve('artifacts/salesos-e2e-screens');
fs.mkdirSync(previewDir,{recursive:true});
async function screenshot(page,name){await page.screenshot({path:path.join(previewDir,name+'.png'),fullPage:true,animations:'disabled'});}

function launch(command,args,env,cwd=process.cwd()){
 const cp=spawn(command,args,{cwd,env:{...process.env,...env},stdio:['ignore','pipe','pipe']});
 let output='';
 for(const stream of [cp.stdout,cp.stderr])stream.on('data',chunk=>output=(output+chunk.toString()).slice(-16000));
 children.push(cp);
 return {cp,logs:()=>output};
}
async function completeMfa(page){
 await page.waitForURL('**/two-factor',{timeout:15000});
 await page.getByRole('heading',{name:'Enter your verification code'}).waitFor();
 const code=await page.evaluate(()=>{const raw=sessionStorage.getItem('salesos_mfa');return raw?JSON.parse(raw).testCode:'';});
 assert.match(String(code),/^\d{6}$/,'CI MFA test code must be available only in test mode.');
 await page.getByPlaceholder('000000').fill(String(code));
 await page.getByRole('button',{name:'Verify & continue'}).click();
}
async function ready(url,processHandle){
 for(let attempt=0;attempt<90;attempt++){
  if(processHandle.cp.exitCode!==null)throw Error('Server terminated: '+processHandle.logs());
  try{const response=await fetch(url,{signal:AbortSignal.timeout(1000)});if(response.ok)return;}catch{}
  await sleep(400);
 }
 throw Error('Server did not start: '+url+'\n'+processHandle.logs());
}
async function main(){
 const unique=randomUUID().slice(0,12);
 const email='ci-browser-'+unique+'@example.invalid';
 const password='CI_Browser_Only_Password_123456!';
 const user=await db.user.create({data:{name:'CI Browser Reviewer',email,passwordHash:await argon2.hash(password),role:'SALES_REP'}});
 const org=await db.organization.upsert({where:{slug:'seebot'},create:{slug:'seebot',name:'CI Seebot',status:'ACTIVE'},update:{}});
 await db.organizationMembership.upsert({where:{organizationId_userId:{organizationId:org.id,userId:user.id}},create:{organizationId:org.id,userId:user.id,role:'MEMBER'},update:{status:'ACTIVE'}});
 const api=launch(process.execPath,['apps/api/dist/main.js'],{API_PORT:'4000',TENANT_SCOPED_CRM_PREVIEW:'true',DEV_EMAIL_SIGNUP_ENABLED:'true',MFA_TEST_MODE:'true'});
 const nextBin=require.resolve('next/dist/bin/next',{paths:[require('node:path').resolve('apps/web')]});
 const web=launch(process.execPath,[nextBin,'start','-p','3000','-H','127.0.0.1'],{NEXT_PUBLIC_API_URL:'http://localhost:4000'},path.resolve('apps/web'));
 await ready('http://127.0.0.1:4000/health',api);
 await ready('http://127.0.0.1:3000/login',web);
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
 try{
  const page=await browser.newPage({baseURL:'http://localhost:3000'});
  await page.goto('/');
  await page.waitForURL('**/login');
  await page.getByRole('heading',{name:'Welcome back'}).waitFor();
  await screenshot(page,'01-login');
  await page.getByRole('link',{name:'Create an account'}).waitFor();
  await page.getByRole('link',{name:'Forgot password?'}).click();
  await page.getByRole('heading',{name:'Forgot your password?'}).waitFor();
  await page.getByText(/Password recovery email is not configured/).waitFor();
  await page.getByRole('link',{name:'Return to sign in'}).click();
  await page.getByRole('heading',{name:'Welcome back'}).waitFor();
  await page.getByText(/Google sign-in will appear when the administrator configures Google OAuth/).waitFor();

  await page.getByPlaceholder('name@company.com').fill(email);
  await page.getByPlaceholder('Your password').fill(password);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await completeMfa(page);
  await page.waitForURL('**/dashboard',{timeout:15000});
  await screenshot(page,'02-dashboard');
  // Seed a second workspace to exercise the chooser independently of creation.
  const name='CI Browser Organization '+unique;
  await db.organization.create({data:{slug:'ci-browser-'+unique,name,status:'SETUP',memberships:{create:{userId:user.id,role:'ADMIN',status:'ACTIVE'}}}});
  await page.goto('/workspaces');
  await page.getByRole('heading',{name:'Company workspaces'}).waitFor();
  await page.getByRole('button',{name:'Create another organization'}).waitFor();
  const row=page.locator('.ws-choice').filter({hasText:name});
  await row.getByRole('button',{name:'Open'}).click();
  await page.waitForURL(/\/workspaces\/[^/]+$/,{timeout:15000});
  await page.getByRole('heading',{name:/Good morning/}).waitFor();
  await page.getByRole('link',{name:'Kanban Pipeline',exact:true}).click();
  await page.getByRole('heading',{name:'Kanban Pipeline'}).waitFor();
  await screenshot(page,'03-workspace-pipeline');
  await page.getByRole('link',{name:'Executive Overview'}).click();
  await page.getByRole('heading',{name:'Executive Overview'}).waitFor();
  await screenshot(page,'04-executive-overview');
  await page.getByRole('link',{name:'Tasks & Follow-ups'}).click();
  await page.locator('h1').filter({hasText:'Tasks & Follow-ups'}).waitFor();
  await page.getByRole('link',{name:'Campaigns'}).click();
  await page.locator('h1').filter({hasText:'Campaigns'}).waitFor();
  await page.getByRole('link',{name:/Prospects & Accounts/i}).click();
  await page.getByRole('heading',{name:'Prospects & Accounts',exact:true}).waitFor();
  await page.getByRole('button',{name:'New prospect'}).click();
  const prospect='Browser Fictional Prospect '+unique;
  await page.getByLabel('Company name').fill(prospect);
  await page.getByPlaceholder('https://acme.example').fill('https://prospect-'+unique+'.example');
  await page.getByRole('button',{name:'Create prospect'}).click();
  await page.getByText(prospect,{exact:true}).waitFor({timeout:10000});
  const relationshipAccount=await db.account.findFirstOrThrow({where:{name:prospect}});
  const relationshipOpportunity=await db.opportunity.findFirstOrThrow({where:{accountId:relationshipAccount.id},orderBy:{createdAt:'asc'}});
  await require('./tenant-sales-journey.cjs').reachContracting(async(method,route,body)=>{
   const response=await page.request.fetch('http://localhost:4000/api'+route,{method,data:body,headers:{Origin:'http://localhost:3000'}});
   assert.ok(response.ok(),method+' '+route+' '+await response.text());return response.json();
  },relationshipAccount.organizationId,relationshipAccount.id,relationshipOpportunity.id);
  await page.getByRole('link',{name:'Client Satisfaction'}).click();
  await page.getByRole('heading',{name:'Client Satisfaction',exact:true}).waitFor();
  await screenshot(page,'05-client-satisfaction');
  const questionnaireName='CI Relationship Questionnaire '+unique;
  await page.getByLabel('Questionnaire name').fill(questionnaireName);
  await page.getByRole('button',{name:'Create questionnaire'}).click();
  await page.getByText('Questionnaire created.').waitFor({timeout:10000});
  await page.getByRole('navigation',{name:'Company navigation'}).getByRole('link',{name:'Client Management'}).click();
  await page.getByText(prospect,{exact:true}).waitFor({timeout:10000});
  await page.getByRole('link',{name:'Open '+prospect}).click();
  await page.getByRole('heading',{name:prospect}).waitFor({timeout:10000});
  await page.getByRole('heading',{name:'Send satisfaction survey'}).waitFor();
  await page.getByLabel('Recipient email').fill('fictional-client-'+unique+'@example.invalid');
  await page.getByRole('combobox',{name:'Questionnaire template'}).click();
  await page.getByRole('option',{name:questionnaireName}).click();
  await page.getByRole('button',{name:'Send survey'}).click();
  const previewLink=page.getByRole('link',{name:'Open private preview questionnaire'});
  await previewLink.waitFor({timeout:10000});
  const previewUrl=await previewLink.getAttribute('href');assert.ok(previewUrl);
  const surveyPage=await browser.newPage();
  try{
   await surveyPage.goto(previewUrl);
   const ratingGroup=surveyPage.getByRole('group',{name:'How would you rate your overall experience?'});
   await ratingGroup.waitFor({timeout:10000});
   await ratingGroup.getByRole('button',{name:'5'}).click();
   await surveyPage.getByRole('button',{name:'Submit feedback'}).click();
   await surveyPage.getByRole('heading',{name:'Thank you for your feedback.'}).waitFor({timeout:10000});
  }finally{await surveyPage.close();}
  await page.getByRole('link',{name:'Client Satisfaction'}).click();
  await page.locator('table.data-table tbody tr').filter({hasText:questionnaireName}).waitFor({timeout:10000});
  await page.getByRole('link',{name:'Contracts & Finance'}).click();
  await page.getByText('Finance tax rules').first().waitFor({timeout:10000});
  await screenshot(page,'06-contracts-finance');
  // Commercial actions are optional, not an artificial mandatory three-step wizard.
  await page.getByRole('button',{name:/Draft contract/}).click();
  await page.getByRole('combobox',{name:'Company account'}).click();
  await page.getByRole('option',{name:new RegExp(prospect)}).click();
  await page.getByRole('combobox',{name:'Opportunity for contract'}).click();
  await page.getByRole('option',{name:new RegExp(prospect+' — Initial Engagement')}).click();
  await page.getByLabel('Contract title').fill('CI Browser Draft SOW '+unique);
  await page.getByRole('button',{name:'Create draft contract'}).click();
  await page.getByText('Draft contract created under the selected opportunity.').waitFor({timeout:10000});
  await page.getByRole('button',{name:/Invoice draft/}).click();
  await page.getByRole('combobox',{name:'Company account'}).click();
  await page.getByRole('option',{name:new RegExp(prospect)}).click();
  await page.getByLabel('Line description').fill('CI browser annotation services');
  await page.getByLabel('Unit price').fill('100.00');
  await page.getByLabel('Billing email').fill('ci-billing-'+unique+'@example.invalid');
  await page.getByLabel('Due date').fill('2030-01-10');
  await page.getByRole('button',{name:'Create invoice draft'}).click();
  await page.getByText('Invoice draft created. Finance review is required before approval and issue.').waitFor({timeout:10000});
  const drafted=await db.invoice.findFirst({where:{billingEmail:'ci-billing-'+unique+'@example.invalid'},include:{contract:true}});
  assert.ok(drafted,'Invoice draft should persist to PostgreSQL.');

  await page.getByText('Create a finance tax rule').click();
  await page.getByLabel('Unique rate/version code').fill('CI_BROWSER_'+unique.toUpperCase());
  await page.getByLabel('Rule name').fill('CI Browser Test Standard');
  await page.getByLabel('Finance-confirmed rate %').fill('20');
  await page.getByRole('button',{name:'Save rule draft'}).click();
  await page.getByText('Finance record saved.').waitFor({timeout:10000});
  await page.getByRole('button',{name:'Approve',exact:true}).click();
  await page.getByRole('button',{name:'Archive',exact:true}).waitFor({timeout:10000});
  await page.getByText('Apply an approved rule to an invoice draft').click();
  await page.getByRole('combobox',{name:'Invoice draft'}).click();
  await page.getByRole('option',{name:new RegExp(drafted.number)}).click();
  await page.getByRole('combobox',{name:'Finance-approved tax rule'}).click();
  await page.getByRole('option',{name:/CI_BROWSER_/}).click();
  await page.getByLabel('Document the tax basis').fill('Fictional CI browser-reviewed standard tax treatment.');
  await page.getByRole('button',{name:'Approve invoice tax calculation'}).click();
  await page.getByText('Tax review saved to invoice with locked rate and total.').waitFor({timeout:10000});
  await page.getByRole('combobox',{name:'Finance invoice'}).click();
  await page.getByRole('option',{name:new RegExp(drafted.number)}).click();
  await page.getByRole('button',{name:'Approve reviewed draft'}).click();
  await page.getByRole('button',{name:'Issue invoice PDF'}).waitFor({timeout:10000});
  const approved=await db.invoice.findUniqueOrThrow({where:{id:drafted.id},include:{taxReview:true}});
  assert.equal(approved.status,'APPROVED');
  assert.equal(approved.total.toFixed(2),'120.00');
  assert.equal(approved.taxReview?.ratePercentSnapshot?.toString(),'20');
  console.log('PASS: browser login, company onboarding, prospect, opportunity, contract, invoice draft, tax rule, tax review, finance approval.');

  // A freshly authenticated account without a company must reach setup, not legacy CRM.
  const guestEmail='ci-new-user-'+unique+'@fresh-'+unique+'.example';
  const guest=await db.user.create({data:{email:guestEmail,name:'CI New Workspace User',passwordHash:await argon2.hash(password),role:'SALES_REP'}});
  const newContext=await browser.newContext(),newPage=await newContext.newPage();
  try{
   await newPage.goto('http://localhost:3000/login');
   await newPage.getByPlaceholder('name@company.com').fill(guestEmail);
   await newPage.getByPlaceholder('Your password').fill(password);
   await newPage.getByRole('button',{name:'Sign in',exact:true}).click();
   await completeMfa(newPage);
   await newPage.waitForURL(/\/workspaces\?new=1/,{timeout:15000});
   await newPage.getByRole('heading',{name:'Create your company workspace'}).waitFor();
   await screenshot(newPage,'07-company-setup');
   const ownName='CI Fresh Team '+unique;
   await newPage.getByLabel('Company name').fill(ownName);
   await newPage.getByPlaceholder('https://company.com').fill('https://fresh-'+unique+'.example');
   await newPage.getByRole('button',{name:'Create workspace'}).click();
   await newPage.getByRole('heading',{name:'Bring your team to '+ownName}).waitFor({timeout:15000});
   const ownerMembership=await db.organizationMembership.findFirst({where:{userId:guest.id,role:'OWNER'},include:{organization:true}});
   assert.ok(ownerMembership,'New creator becomes the workspace administrator.');
   assert.equal(ownerMembership.organization.name,ownName);
   const invitedEmail='ci-invite-browser-'+unique+'@example.invalid';
   const chips=newPage.getByLabel('Invite team email addresses');
   await chips.fill(invitedEmail);
   await chips.press('Enter');
   await newPage.getByRole('button',{name:'Remove '+invitedEmail}).waitFor();
   await newPage.getByRole('button',{name:'Send team invitations'}).click();
   const link=await newPage.getByLabel('Invite link '+invitedEmail).inputValue({timeout:10000});
   assert.ok(new URL(link).searchParams.get('token'));
   const storedInvite=await db.workspaceInvitation.findFirst({where:{organizationId:ownerMembership.organizationId}});
   assert.equal(storedInvite?.status,'PENDING');
   // Optional settings should not require invoice details and must return to company home.
   await newPage.getByRole('button',{name:'Review optional company settings'}).click();
   await newPage.getByRole('heading',{name:ownName}).waitFor({timeout:10000});
   await newPage.getByRole('button',{name:'Save & continue'}).click();
   await newPage.waitForURL(url=>url.pathname==='/workspaces/'+ownerMembership.organizationId,{timeout:15000});
   await newPage.getByRole('heading',{name:/Good morning/}).waitFor();
   await newPage.getByRole('link',{name:'Team & Settings'}).click();
   await newPage.getByRole('heading',{name:'Team & Settings'}).waitFor({timeout:10000});
   await screenshot(newPage,'08-team-settings');
   await newPage.getByRole('button',{name:'Operations & Data'}).click();
   await newPage.getByRole('heading',{name:'Hourly preparation'}).waitFor();
   await newPage.getByLabel('Prepare billing drafts').check();
   await newPage.getByRole('button',{name:'Save preparation settings'}).click();
   await newPage.getByText(/Preparation settings saved/).waitFor();
   assert.equal((await db.workspaceAutomation.findUnique({where:{organizationId:ownerMembership.organizationId}})).billingDrafts,true);
   const [download]=await Promise.all([newPage.waitForEvent('download'),newPage.getByRole('button',{name:/Download accounts/}).click()]);
   const exported=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
   assert.equal(exported.organizationId,ownerMembership.organizationId);
   assert.equal(exported.resource,'accounts');
   await screenshot(newPage,'09-operations-data');

   await newPage.getByRole('button',{name:'Sales Workflow'}).click();
   await newPage.getByRole('heading',{name:'Pipeline configuration'}).waitFor({timeout:10000});
   await newPage.getByLabel('Stage name').fill('CI Qualified Research');
   await newPage.getByRole('button',{name:'Save pipeline settings'}).click();
   await newPage.getByText('Pipeline settings saved.').waitFor({timeout:10000});
   await newPage.getByRole('link',{name:'Kanban Pipeline',exact:true}).click();
   await newPage.getByText('CI Qualified Research',{exact:true}).waitFor({timeout:10000});
   await newPage.getByRole('link',{name:/Prospects & Accounts/i}).click();
   await newPage.getByRole('heading',{name:'Prospects & Accounts',exact:true}).waitFor();
   await newPage.getByRole('link',{name:'Team & Settings'}).click();
   await newPage.getByRole('button',{name:'Suspend organization',exact:true}).click();
   await newPage.getByLabel('Organization identifier').fill(ownerMembership.organization.slug);
   await newPage.getByRole('button',{name:'Confirm suspension'}).click();
   await newPage.waitForURL(url=>url.pathname==='/workspaces',{timeout:10000});
   await newPage.getByRole('heading',{name:'Organization suspended'}).waitFor();
   await screenshot(newPage,'10-suspended-organization');
   await newPage.getByRole('button',{name:'Reactivate organization',exact:true}).click();
   await newPage.getByLabel('Organization identifier').fill(ownerMembership.organization.slug);
   await newPage.getByRole('button',{name:'Confirm reactivation'}).click();
   const restoredRow=newPage.locator('.ws-choice').filter({hasText:ownName});
   await restoredRow.getByRole('button',{name:'Open',exact:true}).click();
   await newPage.waitForURL(url=>url.pathname==='/workspaces/'+ownerMembership.organizationId,{timeout:10000});
   await newPage.getByRole('button',{name:'Sign out'}).click();
   await newPage.waitForURL('**/login',{timeout:10000});
   await newPage.getByRole('heading',{name:'Welcome back'}).waitFor();
  }finally{await newContext.close();}

  // UI self-registration must create a standalone identity and route to company setup.
  const signupContext=await browser.newContext(),signupPage=await signupContext.newPage();
  try{
   await signupPage.goto('http://localhost:3000/login');
   await signupPage.getByRole('link',{name:'Create an account'}).click();
   await signupPage.getByRole('heading',{name:'Get started with SalesOS'}).waitFor();
   await signupPage.getByText(/Private development preview/).waitFor();
   await signupPage.getByPlaceholder('Full name').fill('CI Signup User');
   const signupEmail='ci-signup-ui-'+unique+'@example.invalid';
   await signupPage.getByPlaceholder('name@company.com').fill(signupEmail);
   await signupPage.getByPlaceholder('At least 12 characters').fill(password);
   await signupPage.getByRole('button',{name:'Create account',exact:true}).click();
   // Signup alone must NEVER set an authenticated workspace cookie.
   await signupPage.getByText(/CI-only preview account created/).waitFor({timeout:10000});
   const signupSession=(await signupPage.context().cookies()).find(c=>c.name==='salesos_session');
   assert.equal(signupSession,undefined,'Signup must not issue an MFA-verified session.');
   await signupPage.getByRole('link',{name:'Return to sign in'}).click();
   await signupPage.getByPlaceholder('name@company.com').fill(signupEmail);
   await signupPage.getByPlaceholder('Your password').fill(password);
   await signupPage.getByRole('button',{name:'Sign in',exact:true}).click();
   await completeMfa(signupPage);
   await signupPage.waitForURL(/\/workspaces\?new=1/,{timeout:15000});
   const newSignup=await db.user.findUniqueOrThrow({where:{email:signupEmail},include:{organizationMemberships:true}});
   assert.equal(newSignup.organizationMemberships.length,0,'UI signup must not grant Seebot membership');
  }finally{await signupContext.close();}
  // A genuinely verified one-use signup link is only first-factor identity proof.
  // It MUST route to the same mandatory second-factor challenge.
  const verificationContext=await browser.newContext(),verificationPage=await verificationContext.newPage();
  try{
    const signupEmail='ci-verified-signup-'+unique+'@example.invalid';
    const rawToken=randomBytes(32).toString('base64url');
    await db.signupChallenge.create({data:{
      email:signupEmail,name:'CI Verified Signup User',
      passwordHash:await argon2.hash(password),
      tokenHash:createHash('sha256').update(rawToken).digest('hex'),
      expiresAt:new Date(Date.now()+20*60_000)
    }});
    await verificationPage.goto('http://localhost:3000/verify-email?token='+encodeURIComponent(rawToken));
    await verificationPage.waitForURL('**/two-factor',{timeout:15000});
    const before=(await verificationPage.context().cookies()).find(x=>x.name==='salesos_session');
    assert.equal(before,undefined,'Email verification must not grant a session before MFA.');
    await completeMfa(verificationPage);
    await verificationPage.waitForURL(url=>url.pathname==='/workspaces'&&url.searchParams.get('new')==='1',{timeout:15000});
    const after=(await verificationPage.context().cookies()).find(x=>x.name==='salesos_session');
    assert.ok(after?.httpOnly,'After correct MFA, sign-in must create a protected server cookie.');
    assert.equal((await db.signupChallenge.findUnique({where:{email:signupEmail}})),null,'Signup token must be one-use.');
  }finally{await verificationContext.close();}
  console.log('PASS: signup, forgot-password configuration and Google OAuth states visible in UI.');

  // Respect the real shared resend/sign-in cooldown before signing in again.
  await sleep(31_000);
  // Multiple memberships require an explicit workspace choice on the next login.
  await db.organization.create({data:{slug:'ci-second-'+unique,name:'CI Second Team '+unique,status:'SETUP',memberships:{create:{userId:guest.id,role:'MEMBER',status:'ACTIVE'}}}});
  const multiContext=await browser.newContext(),multiPage=await multiContext.newPage();
  try{
   await multiPage.goto('http://localhost:3000/login');
   await multiPage.getByPlaceholder('name@company.com').fill(guestEmail);
   await multiPage.getByPlaceholder('Your password').fill(password);
   await multiPage.getByRole('button',{name:'Sign in',exact:true}).click();
   await completeMfa(multiPage);
   await multiPage.waitForURL(/\/workspaces(?:\?.*)?$/,{timeout:15000});
   await multiPage.getByText('CI Second Team '+unique).waitFor({timeout:10000});
  }finally{await multiContext.close();}
  console.log('PASS: new-user workspace setup, team invitation link and multi-workspace selection.');

 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
 for(const cp of children)cp.kill('SIGTERM');
 await db.$disconnect();
});
