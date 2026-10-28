import 'reflect-metadata';
import 'dotenv/config';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import { BadRequestException } from '@nestjs/common';
import { AppModule } from './app.module';
async function bootstrap(){
  if(!process.env.JWT_SECRET||process.env.JWT_SECRET.length<32||process.env.JWT_SECRET.includes('REPLACE_'))throw Error('Set a strong JWT_SECRET (32+ chars).');
  if(process.env.NODE_ENV==='production'&&(!process.env.MFA_CODE_SECRET||process.env.MFA_CODE_SECRET.length<32))throw Error('Set a separate strong MFA_CODE_SECRET (32+ chars) before production start.');
  const app=await NestFactory.create(AppModule);
  const proxyHops=Number(process.env.TRUST_PROXY_HOPS||0);
  if(!Number.isInteger(proxyHops)||proxyHops<0||proxyHops>4)throw Error('TRUST_PROXY_HOPS must be 0–4 for your trusted reverse-proxy topology.');
  app.getHttpAdapter().getInstance().set('trust proxy',proxyHops);
  app.use(helmet());app.use(cookieParser());
  const allowedOrigin=process.env.CORS_ORIGIN||'http://localhost:3000';
  const allowedOrigins=new Set([allowedOrigin]);
  if(process.env.NODE_ENV!=='production'){
    allowedOrigins.add('http://localhost:3000');
    allowedOrigins.add('http://127.0.0.1:3000');
    // Accept only THIS Codespace's forwarded web origin, not arbitrary github.dev hosts.
    const name=process.env.CODESPACE_NAME;
    if(name&&/^[a-z0-9-]+$/i.test(name)){
      for(const domain of ['app.github.dev','preview.app.github.dev',process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN||'']){
        if(/^[a-z0-9.-]+$/i.test(domain))allowedOrigins.add('https://'+name+'-3000.'+domain);
      }
    }
  }
  const validOrigin=(origin:unknown)=>typeof origin==='string'&&allowedOrigins.has(origin);
  app.enableCors({origin:(origin,callback)=>callback(null,!origin||validOrigin(origin)),credentials:true,methods:['GET','POST','PATCH','DELETE','OPTIONS']});
  // The session cookie is SameSite=Strict. Still require an exact trusted origin for all writes.
  app.use((req:any,res:any,next:any)=>{
    if(['POST','PATCH','PUT','DELETE'].includes(req.method)&&req.headers.origin&&!validOrigin(req.headers.origin)){
      return res.status(403).json({message:'Unrecognized application address. Reopen the private Codespaces port 3000 URL.'});
    }
    next();
  });
  app.setGlobalPrefix('api');
  app.getHttpAdapter().get('/health',(_req:any,res:any)=>res.json({status:'ok'}));
  await app.listen(Number(process.env.API_PORT||4000),'0.0.0.0');
  console.log(`SalesOS API listening on ${process.env.API_PORT||4000}`);
}
bootstrap().catch(err=>{console.error(err);process.exit(1)});
