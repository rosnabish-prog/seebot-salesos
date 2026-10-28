import {Injectable} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service';
import {FinancePreparationService} from './finance-preparation.service';
import {randomUUID} from 'node:crypto';
import type {BackgroundJob} from '@prisma/client';

const LEASE_MS=300_000;
@Injectable()
export class BackgroundJobsService{
 constructor(private db:PrismaService,private finance:FinancePreparationService){}
 async enqueue(kind:string,key:string,organizationId:string|null){
  try{return await this.db.backgroundJob.create({data:{kind,key,organizationId}});}catch(e:any){if(e.code!=='P2002')throw e;return null;}
 }
 async schedule(now=new Date()){
  const hour=now.toISOString().slice(0,13),day=now.toISOString().slice(0,10);
  await this.enqueue('MAINTENANCE','maintenance:'+day,null);
  // Keyset pagination ensures no organization is omitted as the tenant count grows.
  let after:string|undefined;
  do{
   const settings=await this.db.workspaceAutomation.findMany({where:{organization:{status:{in:['SETUP','ACTIVE']}},OR:[{billingDrafts:true},{reminderTasks:true}],...(after?{organizationId:{gt:after}}:{})},orderBy:{organizationId:'asc'},take:100});
   for(const setting of settings){
    if(setting.billingDrafts)await this.enqueue('BILLING_DRAFTS','billing:'+setting.organizationId+':'+hour,setting.organizationId);
    if(setting.reminderTasks)await this.enqueue('REMINDER_TASKS','reminders:'+setting.organizationId+':'+hour,setting.organizationId);
   }
   after=settings.length===100?settings.at(-1)!.organizationId:undefined;
  }while(after);
 }
 async claim(){
  const token=randomUUID(),now=new Date(),lease=new Date(now.getTime()+LEASE_MS);
  return this.db.$transaction(async tx=>{
   await tx.$executeRaw`UPDATE "BackgroundJob" SET status='FAILED',"lastError"='LEASE_EXHAUSTED',"finishedAt"=${now},"leaseToken"=NULL,"leaseUntil"=NULL,"updatedAt"=${now} WHERE status='RUNNING' AND "leaseUntil"<${now} AND attempts>="maxAttempts"`;
   const rows=await tx.$queryRaw<BackgroundJob[]>`
    WITH candidate AS (
     SELECT id FROM "BackgroundJob" WHERE attempts<"maxAttempts" AND
      ((status='PENDING' AND "availableAt"<=${now}) OR (status='RUNNING' AND "leaseUntil"<${now}))
     ORDER BY "availableAt",id FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE "BackgroundJob" j SET status='RUNNING',attempts=j.attempts+1,"leaseToken"=${token},"leaseUntil"=${lease},"updatedAt"=${now}
    FROM candidate c WHERE j.id=c.id RETURNING j.*`;
   return rows[0]||null;
  });
 }
 async runOne(){
  const job=await this.claim();if(!job)return false;
  let lost=false;
  const heartbeat=setInterval(()=>{void this.db.backgroundJob.updateMany({where:{id:job.id,status:'RUNNING',leaseToken:job.leaseToken},data:{leaseUntil:new Date(Date.now()+LEASE_MS)}}).then(r=>{if(!r.count)lost=true;}).catch(()=>{lost=true;});},60_000);
  heartbeat.unref();
  try{
   let result:any={};
   if(job.kind==='MAINTENANCE'){
    const grace=new Date(Date.now()-7*86400000),jobCutoff=new Date(Date.now()-30*86400000);
    const counters=await this.db.authRateLimit.deleteMany({where:{expiresAt:{lt:grace}}});
    const history=await this.db.backgroundJob.deleteMany({where:{status:{in:['SUCCEEDED','CANCELLED']},finishedAt:{lt:jobCutoff}}});
    result={expiredCountersRemoved:counters.count,oldJobsRemoved:history.count};
   }else{
    const setting=job.organizationId?await this.db.workspaceAutomation.findUnique({where:{organizationId:job.organizationId},include:{organization:true}}):null;
    if(!setting||!['SETUP','ACTIVE'].includes(setting.organization.status)||!(job.kind==='BILLING_DRAFTS'?setting.billingDrafts:job.kind==='REMINDER_TASKS'?setting.reminderTasks:false)){
     await this.db.backgroundJob.updateMany({where:{id:job.id,leaseToken:job.leaseToken,status:'RUNNING'},data:{status:'CANCELLED',leaseToken:null,leaseUntil:null,finishedAt:new Date()}});return true;
    }
    result=job.kind==='BILLING_DRAFTS'?await this.finance.billing(setting.organizationId,setting.enabledById,true):await this.finance.reminders(setting.organizationId,setting.enabledById,true);
   }
   if(!lost)await this.db.backgroundJob.updateMany({where:{id:job.id,leaseToken:job.leaseToken,status:'RUNNING'},data:{status:'SUCCEEDED',result,finishedAt:new Date(),leaseToken:null,leaseUntil:null,lastError:null}});
  }catch(error:any){
   // Persist a safe error code; provider messages, addresses and secrets never enter job status.
   const code=error?.getStatus?.()===403?'AUTHORIZATION_REVOKED':/^P\d{4}$/.test(error?.code||'')?error.code:'PREPARATION_FAILED';
   const failed=job.attempts>=job.maxAttempts||code==='AUTHORIZATION_REVOKED';
   await this.db.backgroundJob.updateMany({where:{id:job.id,leaseToken:job.leaseToken,status:'RUNNING'},data:{status:failed?'FAILED':'PENDING',lastError:code,availableAt:new Date(Date.now()+Math.min(3600_000,30_000*2**(job.attempts-1))),leaseToken:null,leaseUntil:null,finishedAt:failed?new Date():null}});
   console.error(JSON.stringify({event:'background_job_failed',jobId:job.id,kind:job.kind,code,terminal:failed}));
  }finally{clearInterval(heartbeat);}
  return true;
 }
}
