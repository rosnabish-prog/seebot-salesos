import {HttpException,Injectable,ServiceUnavailableException} from '@nestjs/common';
import {createHmac} from 'node:crypto';
import {PrismaService} from '../prisma/prisma.service';

/** PostgreSQL performs the counter claim atomically across API instances. No process-local fallback. */
@Injectable()
export class AuthRateLimitService{
 constructor(private db:PrismaService){}
 async consume(bucket:string,identifier:string,limit:number,windowMs:number){
  const secret=process.env.MFA_CODE_SECRET||process.env.JWT_SECRET;
  if(!secret)throw new ServiceUnavailableException('Authentication protection is unavailable.');
  const key=createHmac('sha256',secret).update(bucket+':'+identifier).digest('hex');
  let rows:{count:number;expiresAt:Date}[];
  try{
   rows=await this.db.$queryRaw`
    INSERT INTO "AuthRateLimit" ("key","count","expiresAt")
    VALUES (${key},1,NOW()+${windowMs}*INTERVAL '1 millisecond')
    ON CONFLICT ("key") DO UPDATE SET
     "count"=CASE WHEN "AuthRateLimit"."expiresAt"<=NOW() THEN 1 ELSE LEAST("AuthRateLimit"."count"+1,${limit+1}) END,
     "expiresAt"=CASE WHEN "AuthRateLimit"."expiresAt"<=NOW() THEN NOW()+${windowMs}*INTERVAL '1 millisecond' ELSE "AuthRateLimit"."expiresAt" END
    RETURNING "count","expiresAt"`;
  }catch{throw new ServiceUnavailableException('Authentication protection is unavailable. Try again later.');}
  if(rows[0].count>limit)throw new HttpException({message:'Too many attempts. Try again later.',retryAfter:Math.max(1,Math.ceil((rows[0].expiresAt.getTime()-Date.now())/1000))},429);
 }
}
