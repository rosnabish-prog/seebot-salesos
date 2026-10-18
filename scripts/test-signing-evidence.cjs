/* Offline signature-evidence verification: no Google credentials or live documents. */
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
const {execFileSync,spawnSync}=require('node:child_process');
const {generateKeyPairSync}=require('node:crypto');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'salesos-evidence-ci-'));
const file=(name,contents)=>{const p=path.join(temp,name);fs.writeFileSync(p,contents,{mode:0o600});return p;};
async function main(){
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const privatePath=file('private.pem',privateKey.export({type:'pkcs8',format:'pem'}));
 const publicPath=file('public.pem',publicKey.export({type:'spki',format:'pem'}));
 const secret='CI_EVIDENCE_HMAC_KEY_REPLACE_FOR_PRODUCTION_0123456789';
 process.env.SIGNING_EVIDENCE_DIR=temp;
 process.env.SIGNING_EVIDENCE_PRIVATE_KEY_FILE=privatePath;
 process.env.SIGNING_EVIDENCE_PUBLIC_KEY_FILE=publicPath;
 process.env.SIGNING_AUDIT_KEY=secret;
 const {EvidenceArchiveService}=require('../apps/api/dist/signing/evidence-archive.service.js');
 const {auditDigest}=require('../apps/api/dist/signing/security.js');
 const envelopeId='ci_evidence_000001';
 const event={envelopeId,sequence:1,type:'DOCUMENT_VIEWED',actorEmail:'example@example.invalid',googleSub:'google-example',ipAddress:'127.0.0.1',userAgent:'CI browser',metadata:{fictional:true},occurredAt:new Date('2026-10-18T00:00:00.000Z'),previousDigest:'GENESIS'};
 event.digest=auditDigest(secret,{...event,occurredAt:event.occurredAt.toISOString()});
 const envelope={id:envelopeId,contractId:'fictional-contract',recipientEmail:'example@example.invalid',recipientGoogleSub:'google-example',documentSha256:'a'.repeat(64),signedDocumentId:'fictional-final-doc',signedAt:new Date('2026-10-18T00:02:00.000Z'),audit:[event],document:{id:'fictional-doc'}};
 const service=new EvidenceArchiveService({signingEnvelope:{findUnique:async()=>envelope}});
 const first=await service.archive(envelopeId);
 assert.equal(first.archived,true);assert.equal(first.reused,false);
 const check=await service.verify(envelopeId);assert.equal(check.valid,true);
 const receipt=await service.exportReceipt(envelopeId);
 assert.equal(receipt.payload.envelopeId,envelopeId);
 const location=path.join(temp,envelopeId+'.json');
 execFileSync(process.execPath,['scripts/verify-signing-evidence.mjs',location,publicPath],{cwd:process.cwd(),stdio:'pipe'});
 // A signer receipt cannot be rewritten as a different event without invalidating its signature.
 const tampered=JSON.parse(fs.readFileSync(location,'utf8'));
 tampered.payload.events[0].type='DOCUMENT_SIGNED_UNEXPECTEDLY';
 const tamperedPath=file('tampered.json',JSON.stringify(tampered));
 const invalid=spawnSync(process.execPath,['scripts/verify-signing-evidence.mjs',tamperedPath,publicPath],{cwd:process.cwd(),encoding:'utf8'});
 assert.equal(invalid.status,1,'Tampered evidence must fail independent verification');
 const archivedAgain=await service.archive(envelopeId);
 assert.equal(archivedAgain.reused,true,'Original immutable receipt is reused, not overwritten');
 console.log('PASS: independently pinned Ed25519 evidence, tamper rejection and write-once behavior.');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{fs.rmSync(temp,{recursive:true,force:true})});
