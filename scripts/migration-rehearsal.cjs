/* Disposable PostgreSQL only: fresh deploy, legacy upgrade, and restore-before-upgrade. */
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const base=new URL(process.env.DATABASE_URL||'http://invalid');
if(process.env.CI!=='true'||process.env.NODE_ENV!=='test'||!process.env.DATABASE_URL?.includes('ci_only_password')||!['localhost','127.0.0.1'].includes(base.hostname))throw Error('Migration rehearsal requires disposable loopback CI PostgreSQL.');
const prefix='salesos_rehearsal_'+randomBytes(5).toString('hex');
const names=['fresh','upgrade','restore'].map(s=>prefix+'_'+s);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'salesos-migration-'));
const schema='packages/database/prisma/schema.prisma';
const baseline='20261022000000_baseline';
const url=name=>{const u=new URL(base);u.pathname='/'+name;return u.toString();};
const pgUrl=db=>{const u=new URL(db);u.search='';return u.toString();};
function pg(program,args,input){
 const executable=process.env.PG_SERVICE_CONTAINER?'docker':process.env.PG_BIN?path.join(process.env.PG_BIN,program):program;
 const command=process.env.PG_SERVICE_CONTAINER?['exec','-i',process.env.PG_SERVICE_CONTAINER,program,...args]:args;
 return execFileSync(executable,command,{encoding:'utf8',input,stdio:['pipe','pipe','pipe']});
}
function sql(db,args){
 const input=args[0]==='-f'?fs.readFileSync(args[1],'utf8'):undefined;
 return pg('psql',[pgUrl(db),'-X','-v','ON_ERROR_STOP=1',...(input?[]:args)],input);
}
function prisma(db,args){execFileSync(process.execPath,[require.resolve('prisma/build/index.js'),...args,'--schema='+schema],{env:{...process.env,DATABASE_URL:db},stdio:['ignore','pipe','pipe']});}
function verify(db){
 assert.match(sql(db,['-Atc',`SELECT "name" FROM "Organization" WHERE id='migration-org'`]),/Migration Fixture/);
 assert.match(sql(db,['-Atc',`SELECT role FROM "OrganizationMembership" WHERE "organizationId"='migration-org'`]),/OWNER/);
 assert.equal(sql(db,['-Atc',`SELECT "organizationId" FROM "OutgoingMessage" WHERE id='migration-message'`]).trim(),'migration-org');
 assert.equal(sql(db,['-Atc',`SELECT count(*) FROM "LoginChallenge" WHERE "consumedAt" IS NULL`]).trim(),'0');
 execFileSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','diff','--from-url',db,'--to-schema-datamodel',schema,'--exit-code'],{stdio:['ignore','pipe','pipe']});
}
try{
 for(const name of names)sql(base.toString(),['-c',`CREATE DATABASE "${name}"`]);
 prisma(url(names[0]),['migrate','deploy']);
 prisma(url(names[0]),['migrate','status']);
 sql(url(names[1]),['-f',`packages/database/prisma/migrations/${baseline}/migration.sql`]);
 sql(url(names[1]),['-c',`
  INSERT INTO "User" (id,email,"passwordHash",name,"updatedAt") VALUES ('migration-user','owner@migration.example','NOT_A_LOGIN_HASH','Migration Owner',NOW());
  INSERT INTO "Organization" (id,slug,name,"createdById","updatedAt") VALUES ('migration-org','migration-fixture','Migration Fixture','migration-user',NOW());
  INSERT INTO "OrganizationMembership" ("organizationId","userId",role) VALUES ('migration-org','migration-user','ADMIN');
  INSERT INTO "WorkspaceInvitation" (id,"organizationId",email,name,"tokenHash","expiresAt","createdById") VALUES ('migration-invite','migration-org','invitee@migration.example','Migration Invitee','fixture-only-token-hash',NOW()+INTERVAL '1 day','migration-user');
  INSERT INTO "OutgoingMessage" (id,"createdById","recipientEmail",subject,"bodyText",category,"entityType","entityId","idempotencyKey","updatedAt") VALUES ('migration-message','migration-user','invitee@migration.example','Fictional pending invite','Fictional test message','WORKSPACE_INVITATION','WORKSPACE_INVITATION','migration-invite','migration-fixture-mail',NOW());
  INSERT INTO "LoginChallenge" (id,"userId","codeHash","expiresAt") VALUES ('old-migration-challenge','migration-user','not-valid',NOW()+INTERVAL '1 hour');
 `]);
 prisma(url(names[1]),['migrate','resolve','--applied',baseline]);
 const backup=path.join(dir,'before-upgrade.sql');
 fs.writeFileSync(backup,pg('pg_dump',[pgUrl(url(names[1])),'--no-owner','--no-acl']));
 assert.ok(fs.statSync(backup).size>0);
 prisma(url(names[1]),['migrate','deploy']);verify(url(names[1]));
 sql(url(names[2]),['-f',backup]);
 prisma(url(names[2]),['migrate','deploy']);verify(url(names[2]));
 console.log('PASS: fresh migrations, existing-data upgrade, and backup restoration before upgrade.');
}finally{
 for(const name of names){try{sql(base.toString(),['-c',`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`]);}catch{}}
 fs.rmSync(dir,{recursive:true,force:true});
}
