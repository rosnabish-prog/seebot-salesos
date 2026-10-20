import {assertMfaConfigured} from './auth/mfa-security';
import 'reflect-metadata';
import 'dotenv/config';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import { BadRequestException } from '@nestjs/common';
import { AppModule } from './app.module';
async function bootstrap(){
  assertMfaConfigured();
  if(!process.env.JWT_SECRET||process.env.JWT_SECRET.length<32||process.env.JWT_SECRET.includes('REPLACE_'))throw Error('Set a strong JWT_SECRET (32+ chars).');
  const app=await NestFactory.create(AppModule);
  app.use(helmet());app.use(cookieParser());
  const allowedOrigin=process.env.CORS_ORIGIN||'http://localhost:3000';
  app.enableCors({origin:allowedOrigin,credentials:true,methods:['GET','POST','PATCH','DELETE','OPTIONS']});
  // Restrict cross-origin state-changing requests. Cookies use SameSite=Strict too.
  app.use((req:any,res:any,next:any)=>{
    if(['POST','PATCH','PUT','DELETE'].includes(req.method) && req.headers.origin && req.headers.origin!==allowedOrigin){
      return res.status(403).json({message:'Origin not allowed'});
    }
    next();
  });
  app.setGlobalPrefix('api');
  app.getHttpAdapter().get('/health',(_req:any,res:any)=>res.json({status:'ok'}));
  await app.listen(Number(process.env.API_PORT||4000),'0.0.0.0');
  console.log(`SalesOS API listening on ${process.env.API_PORT||4000}`);
}
bootstrap().catch(err=>{console.error(err);process.exit(1)});
