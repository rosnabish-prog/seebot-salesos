import { Controller,Get,Query,Req,UseGuards,BadRequestException } from '@nestjs/common';
import { AuthGuard,AuthRequest,allowManageAll } from '../common/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
@UseGuards(AuthGuard) @Controller('dashboard')
export class DashboardController {
  constructor(private db:PrismaService){}
  @Get('summary') async summary(@Req()req:AuthRequest,@Query('days')rawDays?:string,@Query('start')rawStart?:string,@Query('end')rawEnd?:string){
    const days=rawDays?Number(rawDays):30;
    if(![7,30,90,180].includes(days)&&!(rawStart&&rawEnd))throw new BadRequestException('days must be 7, 30, 90 or 180');
    const orgId=req.user.organizationId;if(!orgId)throw new BadRequestException('Workspace selection required.');
    const userScope=allowManageAll(req.user)?{}:{ownerId:req.user.id};
    const now=new Date();const start=rawStart&&rawEnd?new Date(`${rawStart}T00:00:00Z`):new Date(now);if(!(rawStart&&rawEnd))start.setUTCDate(start.getUTCDate()-days+1);start.setUTCHours(0,0,0,0);const chosenEnd=rawStart&&rawEnd?new Date(`${rawEnd}T00:00:00Z`):now;const endDate=rawStart&&rawEnd?new Date(Math.min(new Date(`${rawEnd}T23:59:59.999Z`).getTime(),now.getTime())):now;if(!Number.isFinite(start.valueOf())||!Number.isFinite(endDate.valueOf())||start>endDate||endDate.getTime()-start.getTime()>366*86400000||(rawStart&&rawEnd&&chosenEnd>now))throw new BadRequestException('Choose a valid date range ending no later than today (maximum 366 days).');const periodDays=Math.ceil((endDate.getTime()-start.getTime())/86400000); 
    const prior=new Date(start);prior.setUTCDate(prior.getUTCDate()-periodDays);
    const [opportunities,tasks,activities,accounts]=await Promise.all([
      this.db.opportunity.findMany({where:{...userScope,account:{isDemo:false,organizationId:orgId}},include:{account:{select:{name:true,industry:true}},owner:{select:{name:true}},stageVisits:{select:{stage:true,enteredAt:true}},transitions:{select:{toStage:true,createdAt:true}}},orderBy:{createdAt:'desc'},take:10000}),
      this.db.task.findMany({where:{...(allowManageAll(req.user)?{}:{assigneeId:req.user.id}),OR:[{organizationId:orgId,opportunityId:null,assigneeId:req.user.id},{opportunity:{account:{isDemo:false,organizationId:orgId}}}]},include:{opportunity:{select:{id:true,title:true,account:{select:{name:true}}}}},orderBy:{dueAt:'asc'},take:5000}),
      this.db.activity.findMany({where:{...(allowManageAll(req.user)?{}:{actorId:req.user.id}),opportunity:{account:{organizationId:orgId}}},orderBy:{occurredAt:'desc'},take:10,include:{opportunity:{select:{id:true,account:{select:{name:true}}}}}}),
      this.db.account.findMany({where:{...(allowManageAll(req.user)?{}:{ownerId:req.user.id}),isDemo:false,organizationId:orgId},select:{createdAt:true}})
    ]);
    const opened=opportunities.filter(o=>o.status==='OPEN');
    const won=opportunities.filter(o=>o.status==='CLOSED_WON'&&o.closedAt&&o.closedAt>=start&&o.closedAt<=endDate);
    const lost=opportunities.filter(o=>o.status==='CLOSED_LOST'&&o.closedAt&&o.closedAt>=start&&o.closedAt<=endDate);
    const overdue=tasks.filter(t=>t.status==='OPEN'&&t.dueAt&&t.dueAt<now);
    const proposals=opportunities.filter(o=>o.stage==='PILOT_PROPOSED'&&o.status==='OPEN');
    const stalled=opened.filter(o=>{const active=o.stageVisits.filter(v=>v.stage===o.stage).sort((a,b)=>b.enteredAt.getTime()-a.enteredAt.getTime())[0];return active&&(now.getTime()-active.enteredAt.getTime())/(86400000)>14;});
    const created=accounts.filter(a=>a.createdAt>=start);
    const prev=accounts.filter(a=>a.createdAt>=prior&&a.createdAt<start);
    const series=Array.from({length:periodDays},(_,i)=>{
      const d=new Date(start);d.setUTCDate(start.getUTCDate()+i);
      const end=new Date(d);end.setUTCDate(end.getUTCDate()+1);
      return {date:d.toISOString().slice(0,10),created:opportunities.filter(o=>o.createdAt>=d&&o.createdAt<end).length,
      prospects:accounts.filter(a=>a.createdAt>=d&&a.createdAt<end).length,
      won:opportunities.filter(o=>o.status==='CLOSED_WON'&&o.closedAt&&o.closedAt>=d&&o.closedAt<end).length};
    });
    const stageCount=Object.entries(opened.reduce((map,o)=>({...map,[o.stage]:(map[o.stage]||0)+1}),{} as Record<string,number>)).map(([stage,count])=>({stage,count}));
    const sectorMap:Record<string,{total:number;won:number}>= {};
    for(const o of opportunities){const k=o.account.industry;sectorMap[k]??={total:0,won:0};sectorMap[k].total++;if(o.status==='CLOSED_WON')sectorMap[k].won++;}
    const contractByCurrency:Record<string,number>={};
    const cycles=won.map(o=>o.closedAt?(o.closedAt.getTime()-o.createdAt.getTime())/86400000:0).sort((a,b)=>a-b);
    const medianSalesCycle=cycles.length?(cycles.length%2?cycles[Math.floor(cycles.length/2)]:(cycles[cycles.length/2-1]+cycles[cycles.length/2])/2):null;
    for(const o of won){if(o.contractedAmount!==null)contractByCurrency[o.currency]=(contractByCurrency[o.currency]||0)+Number(o.contractedAmount);}
    return {period:{days:periodDays,start:start.toISOString(),end:endDate.toISOString()},kpis:{active:opened.length,newProspects:created.length,priorNewProspects:prev.length,won:won.length,lost:lost.length,winRate:won.length+lost.length?Math.round(100*won.length/(won.length+lost.length)):null,medianSalesCycle,overdue:overdue.length,proposals:proposals.length,stalled:stalled.length},series,stageCount,sectorPerformance:Object.entries(sectorMap).map(([sector,v])=>({sector,...v})),contractByCurrency,atRisk:stalled.slice(0,8).map(o=>({id:o.id,account:o.account.name,stage:o.stage,owner:o.owner.name,updatedAt:o.updatedAt})),needsAttention:[...overdue.slice(0,5).map(t=>({kind:'task',id:t.id,title:t.title,opportunityId:t.opportunityId,dueAt:t.dueAt})),...stalled.slice(0,5).map(o=>({kind:'stalled',id:o.id,title:o.account.name,opportunityId:o.id,dueAt:null}))],recentActivities:activities,generatedAt:now.toISOString()};
  }
  @Get('commercial') async commercial(@Req()req:AuthRequest,@Query('days')rawDays?:string,@Query('start')rawStart?:string,@Query('end')rawEnd?:string,@Query('demo')demo?:string){
    if(!allowManageAll(req.user))throw new BadRequestException('Leadership permissions required.');
    const days=Number(rawDays||90);if(![7,30,90,180,365].includes(days)&&!(rawStart&&rawEnd))throw new BadRequestException('Invalid period.');
    const now=new Date(),start=rawStart&&rawEnd?new Date(`${rawStart}T00:00:00Z`):new Date(now),rawCustomEnd=rawStart&&rawEnd?new Date(`${rawEnd}T00:00:00Z`):now,end=rawStart&&rawEnd?new Date(Math.min(new Date(`${rawEnd}T23:59:59.999Z`).getTime(),now.getTime())):now;
    if(!(rawStart&&rawEnd))start.setUTCDate(start.getUTCDate()-days+1);
    if(!Number.isFinite(start.valueOf())||!Number.isFinite(end.valueOf())||start>end||rawCustomEnd>now||end.getTime()-start.getTime()>366*86400000)throw new BadRequestException('Invalid date window.');
    const isDemo=demo==='true',orgId=req.user.organizationId;if(!orgId)throw new BadRequestException('Workspace selection required.');
    const [opps,contracts,invoices,reviews,surveys,issues,contractAlerts]=await Promise.all([
      this.db.opportunity.findMany({where:{account:{isDemo,organizationId:orgId},status:'OPEN'},select:{estimatedAmount:true,currency:true}}),
      this.db.contract.findMany({where:{isDemo,opportunity:{account:{organizationId:orgId}},status:'SIGNED',signedAt:{gte:start,lte:end}},include:{opportunity:{select:{accountId:true}}}}),
      this.db.invoice.findMany({where:{isDemo,account:{organizationId:orgId}},include:{payments:true,adjustments:true,account:{select:{name:true}},contract:{select:{id:true}}},orderBy:{dueAt:'asc'}}),
      this.db.clientReview.findMany({where:{isDemo,account:{organizationId:orgId},type:'NPS'},include:{account:{select:{id:true,name:true}}},orderBy:{occurredAt:'desc'}}),
      this.db.clientSurveyInvitation.findMany({where:{isDemo,account:{organizationId:orgId},status:'ANSWERED',type:'NPS'},include:{account:{select:{id:true,name:true}}},orderBy:{respondedAt:'desc'}}),
      this.db.clientIssue.findMany({where:{isDemo,account:{organizationId:orgId},status:'OPEN'},include:{account:{select:{name:true}}}}),
      this.db.contract.findMany({where:{isDemo,opportunity:{account:{organizationId:orgId}},OR:[{status:'PENDING_SIGNATURE',signatureDueAt:{lt:now}},{status:'SIGNED',expiresAt:{gte:now,lte:new Date(now.getTime()+30*86400000)}}]},include:{opportunity:{include:{account:{select:{name:true}}}}},take:30})
    ]);
    const valueMap:Record<string,{pipeline:number;signed:number;invoiced:number;collected:number;overdue:number;outstanding:number}>={};
    const group=(c:string)=>valueMap[c]??={pipeline:0,signed:0,invoiced:0,collected:0,overdue:0,outstanding:0};
    for(const o of opps)if(o.estimatedAmount)group(o.currency).pipeline+=Number(o.estimatedAmount);
    for(const c of contracts)if(c.committedAmount)group(c.currency||'USD').signed+=Number(c.committedAmount);
    const overdue:any[]=[];const quarters:Record<string,{quarter:string;invoiced:Record<string,number>;collected:Record<string,number>;signed:Record<string,number>}>={};
    const q=(date:Date)=>{const label=`${date.getUTCFullYear()} Q${Math.floor(date.getUTCMonth()/3)+1}`;return quarters[label]??={quarter:label,invoiced:{},collected:{},signed:{}};};
    for(const c of contracts){if(c.signedAt&&c.committedAmount){const item=q(c.signedAt);item.signed[c.currency||'USD']=(item.signed[c.currency||'USD']||0)+Number(c.committedAmount);}}
    for(const inv of invoices){const paid=inv.payments.reduce((n,p)=>n+Number(p.amount),0),approvedCredits=inv.adjustments.filter(x=>x.status==='APPROVED'&&x.kind==='CREDIT_NOTE').reduce((n,x)=>n+Number(x.amount),0),balance=Math.max(0,Number(inv.total)-paid-approvedCredits);const effective={effectiveStatus:['SENT','PARTIALLY_PAID'].includes(inv.status)&&balance>0&&inv.dueAt<new Date()?'OVERDUE':inv.status};const g=group(inv.currency);if(inv.issuedAt&&inv.issuedAt>=start&&inv.issuedAt<=end){g.invoiced+=Number(inv.total);const item=q(inv.issuedAt);item.invoiced[inv.currency]=(item.invoiced[inv.currency]||0)+Number(inv.total);}
      for(const p of inv.payments){if(p.paidAt>=start&&p.paidAt<=end){g.collected+=Number(p.amount);const item=q(p.paidAt);item.collected[inv.currency]=(item.collected[inv.currency]||0)+Number(p.amount);}}
      if(['SENT','PARTIALLY_PAID'].includes(inv.status)){g.outstanding+=balance;if(effective.effectiveStatus==='OVERDUE'){g.overdue+=balance;overdue.push({id:inv.id,number:inv.number,accountId:inv.accountId,account:inv.account.name,dueAt:inv.dueAt,balance,currency:inv.currency});}}
    }
    const latestNps=new Map<string,{id:string;name:string;score:number;occurredAt:Date}>();for(const r of reviews){if(!latestNps.has(r.accountId)&&r.score!==null)latestNps.set(r.accountId,{id:r.accountId,name:r.account.name,score:r.score,occurredAt:r.occurredAt});}
    for(const s of surveys){const current=latestNps.get(s.accountId);if(s.score!==null && (!current || (s.respondedAt||s.createdAt)>current.occurredAt))latestNps.set(s.accountId,{id:s.accountId,name:s.account.name,score:s.score,occurredAt:s.respondedAt||s.createdAt});}
    const lowNps=[...latestNps.values()].filter(r=>r.score<=6);const openIssues=issues.filter(i=>['HIGH','CRITICAL'].includes(i.severity)).map(i=>({id:i.id,accountId:i.accountId,account:i.account.name,title:i.title,severity:i.severity}));
    const quarterly=Object.values(quarters).sort((a,b)=>a.quarter.localeCompare(b.quarter));
    return {period:{start:start.toISOString(),end:end.toISOString(),isDemo},contractAlerts:contractAlerts.map(c=>({id:c.id,accountId:c.opportunity.accountId,account:c.opportunity.account.name,title:c.title,status:c.status,signatureDueAt:c.signatureDueAt,expiresAt:c.expiresAt})),byCurrency:valueMap,overdueInvoices:overdue.slice(0,25),overdueCount:overdue.length,lowNps,openIssues,quarterly,generatedAt:now.toISOString()};
  }

}
