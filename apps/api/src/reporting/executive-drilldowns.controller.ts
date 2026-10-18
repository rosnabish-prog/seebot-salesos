import {BadRequestException,Controller,Get,Param,Query,Req,UseGuards} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service';
import {AuthGuard,AuthRequest,allowManageAll} from '../common/auth.guard';
@UseGuards(AuthGuard) @Controller('executive/drilldown')
export class ExecutiveDrilldownsController {
 constructor(private db:PrismaService){}
 @Get(':metric')async list(@Req()req:AuthRequest,@Param('metric')metric:string,@Query('demo')demo?:string,@Query('currency')currency?:string){
  if(!allowManageAll(req.user))throw new BadRequestException('Leadership permissions required.');
  const isDemo=demo==='true',cur=currency&&/^[A-Z]{3}$/.test(currency)?currency:undefined;
  if(metric==='overdue-invoices'){
   const inv=await this.db.invoice.findMany({where:{isDemo,account:{organizationId:req.user.organizationId},status:{in:['SENT','PARTIALLY_PAID']},dueAt:{lt:new Date()},...(cur?{currency:cur}:{})},include:{payments:true,adjustments:true,account:{select:{id:true,name:true}}},take:250});
   return {metric,records:inv.map(i=>({id:i.id,accountId:i.accountId,account:i.account.name,number:i.number,currency:i.currency,balance:Math.max(0,Number(i.total)-i.payments.reduce((n,p)=>n+Number(p.amount),0)-i.adjustments.filter(a=>a.status==='APPROVED'&&a.kind==='CREDIT_NOTE').reduce((n,a)=>n+Number(a.amount),0)),dueAt:i.dueAt})).filter(i=>i.balance>0)};
  }
  if(metric==='contract-expiry'){
   const contracts=await this.db.contract.findMany({where:{isDemo,opportunity:{account:{organizationId:req.user.organizationId}},status:'SIGNED',expiresAt:{gte:new Date(),lte:new Date(Date.now()+90*86400000)},...(cur?{currency:cur}:{})},include:{opportunity:{include:{account:{select:{id:true,name:true}}}}},take:200});
   return {metric,records:contracts.map(c=>({id:c.id,accountId:c.opportunity.accountId,account:c.opportunity.account.name,title:c.title,expiresAt:c.expiresAt,currency:c.currency,committedAmount:c.committedAmount}))};
  }
  if(metric==='client-risks'){
   const [reviews,issues]=await Promise.all([this.db.clientSurveyInvitation.findMany({where:{isDemo,account:{organizationId:req.user.organizationId},status:'ANSWERED',type:'NPS',score:{lte:6}},include:{account:{select:{name:true}}},orderBy:{respondedAt:'desc'},take:200}),this.db.clientIssue.findMany({where:{isDemo,account:{organizationId:req.user.organizationId},status:'OPEN',severity:{in:['HIGH','CRITICAL']}},include:{account:{select:{name:true}}},take:200})]);
   return {metric,records:[...reviews.map(r=>({id:r.id,accountId:r.accountId,account:r.account.name,type:'LOW_NPS',score:r.score})),...issues.map(i=>({id:i.id,accountId:i.accountId,account:i.account.name,type:'ISSUE',severity:i.severity,title:i.title}))]};
  }
  throw new BadRequestException('Supported metrics: overdue-invoices, contract-expiry, client-risks.');
 }
}
