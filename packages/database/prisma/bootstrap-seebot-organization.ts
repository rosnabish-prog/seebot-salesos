import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  const organization = await db.organization.upsert({
    where: { slug:'seebot' },
    create: { slug:'seebot', name:'Seebot', legalName:'Seebot', website:'https://seebot.ai', industry:'AI data services', description:'Computer vision, annotation, evaluation and managed data operations.', country:'GB', timezone:'Europe/London', defaultCurrency:'GBP', status:'ACTIVE' },
    update: {}
  });
  const assigned=await db.account.updateMany({where:{organizationId:null},data:{organizationId:organization.id}});
  console.log(`Assigned ${assigned.count} previously unscoped legacy accounts to the Seebot organization.`);
  const scopedTasks=await db.task.updateMany({where:{organizationId:null},data:{organizationId:organization.id}});
  const scopedCampaigns=await db.campaign.updateMany({where:{organizationId:null},data:{organizationId:organization.id}});
  console.log(`Migrated ${scopedTasks.count} legacy tasks and ${scopedCampaigns.count} campaigns into Seebot.`);
  const users = await db.user.findMany({select:{id:true,role:true}});
  for (const user of users) {
    await db.organizationMembership.upsert({
      where:{organizationId_userId:{organizationId:organization.id,userId:user.id}},
      create:{organizationId:organization.id,userId:user.id,role:user.role==='SUPER_ADMIN'?'OWNER':user.role==='CEO'?'ADMIN':'MEMBER',status:'ACTIVE'},
      update:{}
    });
  }
  console.log(`Seebot organization initialized; ${users.length} existing users have memberships. No other organizations activated.`);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect());
