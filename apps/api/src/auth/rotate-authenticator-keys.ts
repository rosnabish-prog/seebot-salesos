import 'dotenv/config';
import {PrismaClient} from '@prisma/client';
import {activeAuthenticatorKeyId,authenticatorKey,openTotp,sealTotp,usesActiveAuthenticatorKey} from './totp';

/** Explicit operator command, dry-run by default. Never prints keys, seeds or ciphertexts. */
export async function rotateAuthenticatorKeys(db:PrismaClient,apply=false,userId?:string){
 authenticatorKey();
 if(!activeAuthenticatorKeyId())throw Error('Configure an active versioned authenticator key before rotation.');
 const counts={accountsChecked:0,secretsToRotate:0,secretsRotated:0,apply};
 // Scan users once so active and pending credentials share the same user row lock.
 let after:string|undefined;
 do{
  const users=await db.user.findMany({where:{...(userId?{id:userId}:{}),...(after?{id:{gt:after}}:{}),OR:[{authenticator:{isNot:null}},{authenticatorEnrollment:{isNot:null}}]},select:{id:true},orderBy:{id:'asc'},take:100});
  for(const user of users){
   const result=await db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
    const [factor,pending]=await Promise.all([tx.userAuthenticator.findUnique({where:{userId:user.id}}),tx.authenticatorEnrollment.findUnique({where:{userId:user.id}})]);
    let needed=0,changed=0;
    for(const [kind,record] of [['active',factor],['pending',pending]] as const){
     if(!record)continue;
     // Always validate decryption/binding, including credentials already on the active key.
     const secret=openTotp(user.id,record.secretEncrypted);
     if(usesActiveAuthenticatorKey(record.secretEncrypted))continue;needed++;
     if(apply){const secretEncrypted=sealTotp(user.id,secret);
      if(kind==='active')await tx.userAuthenticator.update({where:{userId:user.id},data:{secretEncrypted}});
      else await tx.authenticatorEnrollment.update({where:{userId:user.id},data:{secretEncrypted}});changed++;
     }
    }
    if(changed)await tx.auditEvent.create({data:{actorId:user.id,entityType:'USER',entityId:user.id,action:'AUTHENTICATOR_ENCRYPTION_KEY_ROTATED',detail:{keyId:activeAuthenticatorKeyId(),count:changed,source:'OPERATOR_COMMAND'}}});
    return {needed,changed};
   });
   counts.accountsChecked++;counts.secretsToRotate+=result.needed;counts.secretsRotated+=result.changed;
  }
  after=users.length===100?users.at(-1)!.id:undefined;
 }while(after);
 return counts;
}
async function main(){
 const args=process.argv.slice(2),apply=args.includes('--apply'),scope=args.find(a=>a.startsWith('--user='))?.slice(7);
 if(args.some(a=>!['--apply','--dry-run'].includes(a)&&!/^--user=[A-Za-z0-9_-]{1,150}$/.test(a))||apply&&args.includes('--dry-run'))throw Error('Usage: rotate-authenticator-keys [--dry-run | --apply] [--user=ID]');
 const db=new PrismaClient();try{console.log(JSON.stringify(await rotateAuthenticatorKeys(db,apply,scope)));}finally{await db.$disconnect();}
}
if(require.main===module)main().catch(()=>{console.error('Authenticator key rotation stopped. Verify the complete keyring, database access and migrations; keep previous keys until a successful final dry-run.');process.exitCode=1;});
