import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
const prisma = new PrismaClient();
async function run() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 12 || password.includes('REPLACE_')) {
    throw new Error('ADMIN_EMAIL and a strong ADMIN_PASSWORD (12+ chars) are required to bootstrap.');
  }
  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: process.env.ADMIN_NAME || 'Seebot Administrator', role: 'SUPER_ADMIN', passwordHash: await argon2.hash(password) }
  });
  console.log(`Admin account available: ${admin.email} (existing passwords are never reset by seed)`);
  // Safe internal-only bootstrap: existing SalesOS users join Seebot's workspace.
  // This is NOT public multi-tenancy. Existing account/opportunity routes are not tenant-scoped yet.
  const existingSeebot=await prisma.organization.findUnique({where:{slug:'seebot'}});
  const seebot = await prisma.organization.upsert({where:{slug:'seebot'},update:{},create:{slug:'seebot',name:'Seebot',legalName:'Seebot',defaultCurrency:'GBP',timezone:'Europe/London'}});
  // Only bootstrap legacy employees ON FIRST organization initialization. Never enroll new
  // standalone signup users into Seebot when an operator reruns the seed.
  if(!existingSeebot){
    const existingUsers=await prisma.user.findMany({select:{id:true,role:true}});
    for(const member of existingUsers){
      await prisma.organizationMembership.upsert({where:{organizationId_userId:{organizationId:seebot.id,userId:member.id}},update:{},create:{organizationId:seebot.id,userId:member.id,role:member.id===admin.id?'OWNER':['SUPER_ADMIN','SALES_MANAGER'].includes(member.role)?'ADMIN':'MEMBER'}});
    }
  }else{
    await prisma.organizationMembership.upsert({where:{organizationId_userId:{organizationId:seebot.id,userId:admin.id}},update:{},create:{organizationId:seebot.id,userId:admin.id,role:'OWNER'}});
  }
  await prisma.account.updateMany({where:{organizationId:null},data:{organizationId:seebot.id}});
  console.log('Seebot legacy records assigned to original workspace. Tenant-specific CRM API is separate.');
  for(const name of ['Sports Computer Vision','Autonomous Systems','Industrial AI','AI / NLP','Aerial Imagery','Insurance','Other']) {
    await prisma.industry.upsert({where:{name},create:{name},update:{}});
  }
  if (process.env.SEED_DEMO_DATA !== 'true') return;
  const domain = 'example-vision.invalid';
  if (await prisma.account.findFirst({ where: { domain,organizationId:seebot.id } })) return;
  const account = await prisma.account.create({
    data: { organizationId:seebot.id, name: 'Example Vision Labs (DEMO)', domain, website: `https://${domain}`, industry: 'Autonomous Systems', priority: 'HIGH', hypothesis: 'Fictional example: perception dataset evaluation.', ownerId: admin.id }
  });
  await prisma.opportunity.create({
    data: { accountId: account.id, title: 'Evaluation Pilot (DEMO)', serviceLine: 'Computer Vision', ownerId: admin.id, stageVisits: { create: { stage: 'ACCOUNT_RESEARCHED' } } }
  });
  console.log('Optional fictional demo account created.');
}
run().catch(e=>{ console.error(e);process.exitCode=1; }).finally(()=>prisma.$disconnect());
