import {BadRequestException,Controller,Post,Req,UseGuards} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service';
import {AuthGuard,AuthRequest,requireManager} from '../common/auth.guard';
/** Extends only the predefined fictional client. Never invents data for a real account. */
@UseGuards(AuthGuard) @Controller('demo-scenarios')
export class DemoLifecycleController{
 constructor(private db:PrismaService){}
 @Post('full-lifecycle')async seed(@Req()req:AuthRequest){requireManager(req.user);
  const account=await this.db.account.findFirst({where:{domain:'seebot-client-demo.example'},include:{opportunities:{include:{contracts:true}}}});
  if(!account?.isDemo)throw new BadRequestException('Create the fictional Orion client using the existing demo action first.');
  const opp=account.opportunities[0],contract=opp?.contracts[0];if(!contract?.isDemo)throw new BadRequestException('Demo contract missing.');
  const key=`demo-full-lifecycle:${account.id}`;
  const exists=await this.db.localAutomationEvent.findUnique({where:{key}});
  if(exists)return {accountId:account.id,reused:true,fictional:true};
  const now=new Date(),day=(offset:number)=>new Date(now.getTime()+offset*86400000);
  try{await this.db.$transaction(async tx=>{
   await tx.localAutomationEvent.create({data:{key,entityType:'ACCOUNT',entityId:account.id,action:'FICTIONAL_FULL_LIFECYCLE',isDemo:true,createdById:req.user.id}});
   await tx.contractSignatory.createMany({data:[{contractId:contract.id,name:'Jordan Chen (fictional)',email:'procurement@seebot-client-demo.example',signingOrder:1,status:'PENDING'},{contractId:contract.id,name:'Morgan West (fictional)',email:'legal@seebot-client-demo.example',signingOrder:2,status:'PENDING'}],skipDuplicates:true});
   await tx.contractAmendment.create({data:{contractId:contract.id,version:1,title:'DEMO · Additional QA coverage',rationale:'DEMO ONLY — example additional service fee.',effectiveAt:day(-15),pricingSnapshot:[{serviceName:'Video Annotation',model:'HOURLY',rate:12,currency:'USD',unit:'hour'},{serviceName:'QA Retainer',model:'MONTHLY_RETAINER',rate:1500,currency:'USD',unit:'month'}],status:'DRAFT',createdById:req.user.id}});
   await tx.billingSchedule.create({data:{contractId:contract.id,description:'DEMO · Monthly services billing',cadence:'MONTHLY',amount:8000,currency:'USD',nextDueAt:day(8),createdById:req.user.id}});
   const invoice=await tx.invoice.findFirst({where:{accountId:account.id,status:'SENT'},orderBy:{dueAt:'asc'}});
   if(invoice){await tx.invoiceRecipient.create({data:{invoiceId:invoice.id,email:'finance@seebot-client-demo.example',kind:'CC'}});await tx.invoiceAdjustment.create({data:{invoiceId:invoice.id,kind:'CREDIT_NOTE',amount:500,reason:'DEMO ONLY · Quality service adjustment',createdById:req.user.id,status:'DRAFT'}});}
   await tx.deliveryMilestone.createMany({data:[{accountId:account.id,contractId:contract.id,title:'DEMO · Pilot batch delivery',description:'Fictional annotation delivery',acceptanceCriteria:'Written confirmation of 95%+ QA accuracy',dueAt:day(-10),status:'SUBMITTED',isDemo:true,createdById:req.user.id},{accountId:account.id,contractId:contract.id,title:'DEMO · Next quality checkpoint',description:'Fictional recurring quality check',acceptanceCriteria:'Customer acknowledges sample audit',dueAt:day(14),status:'IN_PROGRESS',isDemo:true,createdById:req.user.id}]});
   await tx.clientReport.create({data:{accountId:account.id,type:'QBR',title:'DEMO · Orion QBR Snapshot',periodStart:day(-90),periodEnd:day(-1),createdById:req.user.id,isDemo:true,snapshot:{isDemo:true,health:{score:33,level:'AT_RISK',flags:['Fictional client concern']},actions:['Prepare QA improvement plan']}}});
   await tx.auditEvent.create({data:{actorId:req.user.id,action:'DEMO_FULL_LIFECYCLE_SEEDED',entityType:'ACCOUNT',entityId:account.id,detail:{fictional:true}}});
  },{isolationLevel:'Serializable'});}catch(e:any){if(e?.code==='P2002')return {accountId:account.id,reused:true,fictional:true};throw e;}
  return {accountId:account.id,reused:false,fictional:true,note:'This scenario is fictitious and creates no actual invoices, signatures, payments or sends.'};
 }
}
