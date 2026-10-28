import 'reflect-metadata';
import 'dotenv/config';
import {Module} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import {PrismaService} from './prisma/prisma.service';
import {BackgroundJobsService} from './operations/background-jobs.service';
import {FinancePreparationService} from './operations/finance-preparation.service';

@Module({providers:[PrismaService,FinancePreparationService,BackgroundJobsService]})
class WorkerModule{}
async function main(){
 const app=await NestFactory.createApplicationContext(WorkerModule);
 const jobs=app.get(BackgroundJobsService);
 let stopping=false,nextSchedule=0;
 const stop=()=>{stopping=true;};process.on('SIGTERM',stop);process.on('SIGINT',stop);
 try{
  while(!stopping){
   try{
    if(Date.now()>=nextSchedule){await jobs.schedule();nextSchedule=Date.now()+60_000;}
    if(await jobs.runOne())continue;
   }catch{console.error(JSON.stringify({event:'worker_cycle_failed',code:'DATABASE_OR_QUEUE_UNAVAILABLE'}));}
   await new Promise(resolve=>setTimeout(resolve,1000));
  }
 }finally{await app.close();}
}
main().catch(()=>{console.error('Worker could not start. Check database connectivity and migrations.');process.exitCode=1;});
