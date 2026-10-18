/* Headless browser smoke using disposable CI-only PostgreSQL and fictional records. */
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {PrismaClient}=require('@prisma/client');
const argon2=require('argon2');
const {chromium}=require('playwright');

if(process.env.CI!=='true'||process.env.NODE_ENV!=='test'||!process.env.DATABASE_URL?.includes('ci_only_password'))
 throw Error('Browser smoke must run only against the disposable CI database.');

const db=new PrismaClient();
const children=[];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function launch(command,args,env,cwd=process.cwd()){
 const cp=spawn(command,args,{cwd,env:{...process.env,...env},stdio:['ignore','pipe','pipe']});
 let output='';
 for(const stream of [cp.stdout,cp.stderr])stream.on('data',chunk=>output=(output+chunk.toString()).slice(-16000));
 children.push(cp);
 return {cp,logs:()=>output};
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
 const api=launch(process.execPath,['apps/api/dist/main.js'],{API_PORT:'4000',TENANT_SCOPED_CRM_PREVIEW:'true'});
 const nextBin=require.resolve('next/dist/bin/next',{paths:[require('node:path').resolve('apps/web')]});
 const web=launch(process.execPath,[nextBin,'start','-p','3000','-H','127.0.0.1'],{NEXT_PUBLIC_API_URL:'http://localhost:4000'},path.resolve('apps/web'));
 await ready('http://127.0.0.1:4000/health',api);
 await ready('http://127.0.0.1:3000/login',web);
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({baseURL:'http://localhost:3000'});
  await page.goto('/login');
  await page.getByRole('heading',{name:'Welcome back'}).waitFor();
  await page.getByPlaceholder('name@seebot.ai').fill(email);
  await page.getByPlaceholder('Your password').fill(password);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.waitForURL('**/dashboard',{timeout:15000});
  await page.goto('/workspaces');
  await page.getByRole('heading',{name:'Company Workspaces'}).waitFor();
  const name='CI Browser Organization '+unique;
  await page.getByText('Create a company profile').click();
  await page.getByLabel('Company name').fill(name);
  await page.getByPlaceholder('https://example.com').fill('https://company-'+unique+'.example');
  await page.getByRole('button',{name:'Create workspace profile'}).click();
  await page.getByText(name,{exact:true}).first().waitFor({timeout:10000});
  const row=page.locator('.record-row').filter({hasText:name});
  await row.getByRole('button',{name:'Open workspace'}).click();
  await page.waitForURL(/\/workspaces\/[^/]+\/accounts/,{timeout:15000});
  await page.getByRole('heading',{name:'Company Prospects'}).waitFor();
  const prospect='Browser Fictional Prospect '+unique;
  await page.getByLabel('Company name').fill(prospect);
  await page.getByPlaceholder('https://example.com').fill('https://prospect-'+unique+'.example');
  await page.getByRole('button',{name:'Create prospect'}).click();
  await page.getByText(prospect,{exact:true}).waitFor({timeout:10000});
  await page.getByRole('link',{name:'Business preview'}).click();
  await page.getByText('Finance tax rules').first().waitFor({timeout:10000});
  // Exercise the visible commercial workflow, not just the existence of the page.
  await page.getByLabel('Workspace prospect').selectOption({label:prospect+' (prospect-'+unique+'.example)'},{timeout:10000});
  await page.getByLabel('Opportunity title').fill('CI Browser Service Opportunity '+unique);
  await page.getByRole('button',{name:'Create opportunity',exact:true}).click();
  await page.getByText('Opportunity created in the selected workspace.').waitFor({timeout:10000});
  await page.getByLabel('Contract title').fill('CI Browser Draft SOW '+unique);
  await page.getByRole('button',{name:'Create draft contract'}).click();
  await page.getByText('Draft contract created under the selected opportunity.').waitFor({timeout:10000});
  await page.getByLabel('Billing email').fill('ci-billing-'+unique+'@example.invalid');
  await page.getByLabel('Due date').fill('2030-01-10');
  await page.getByRole('button',{name:'Create invoice draft'}).click();
  await page.getByText('Invoice draft created. Finance must apply and approve a tax rule before it can be issued.').waitFor({timeout:10000});
  const drafted=await db.invoice.findFirst({where:{billingEmail:'ci-billing-'+unique+'@example.invalid'},include:{contract:true}});
  assert.ok(drafted,'Invoice draft should persist to PostgreSQL.');
  assert.equal(drafted.contract?.title,'CI Browser Draft SOW '+unique,'Invoice draft should link to the selected contract.');

  await page.getByText('Create a finance tax rule').click();
  await page.getByLabel('Unique rate/version code').fill('CI_BROWSER_'+unique.toUpperCase());
  await page.getByLabel('Rule name').fill('CI Browser Test Standard');
  await page.getByLabel('Finance-confirmed rate %').fill('20');
  await page.getByRole('button',{name:'Save rule draft'}).click();
  await page.getByText('Finance record saved.').waitFor({timeout:10000});
  await page.getByRole('button',{name:'Approve',exact:true}).click();
  await page.getByRole('button',{name:'Archive',exact:true}).waitFor({timeout:10000});
  await page.getByText('Apply an approved rule to an invoice draft').click();
  await page.getByLabel('Invoice draft').selectOption({index:1});
  await page.getByLabel('Finance-approved tax rule').selectOption({index:1});
  await page.getByLabel('Document the tax basis').fill('Fictional CI browser-reviewed standard tax treatment.');
  await page.getByRole('button',{name:'Approve invoice tax calculation'}).click();
  await page.getByText('Tax review saved to invoice with locked rate and total.').waitFor({timeout:10000});
  const financePanel=page.getByRole('heading',{name:'Invoice approval, delivery & payments'}).locator('..');
  await financePanel.locator('select').first().selectOption({index:1});
  await page.getByRole('button',{name:'Approve reviewed draft'}).click();
  await page.getByRole('status').filter({hasText:'APPROVED'}).waitFor({timeout:10000});
  const approved=await db.invoice.findUniqueOrThrow({where:{id:drafted.id},include:{taxReview:true}});
  assert.equal(approved.status,'APPROVED');
  assert.equal(approved.total.toFixed(2),'120.00');
  assert.equal(approved.taxReview?.ratePercentSnapshot?.toString(),'20');
  console.log('PASS: browser login, company onboarding, prospect, opportunity, contract, invoice draft, tax rule, tax review, finance approval.');
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
 for(const cp of children)cp.kill('SIGTERM');
 await db.$disconnect();
});
