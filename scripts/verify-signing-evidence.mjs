import {readFileSync} from 'node:fs';
import {createHash,createPublicKey,verify} from 'node:crypto';
const [receiptPath,pinnedPublicKeyFile]=process.argv.slice(2);
if(!receiptPath||!pinnedPublicKeyFile){console.error('Usage: node scripts/verify-signing-evidence.mjs <receipt.json> <independently-trusted-ed25519-public.pem>');process.exit(2)}
const r=JSON.parse(readFileSync(receiptPath,'utf8'));
const data=Buffer.from(JSON.stringify(r.payload));
const sha256=createHash('sha256').update(data).digest('hex');
const signatureOk=verify(null,data,createPublicKey(readFileSync(pinnedPublicKeyFile)),Buffer.from(r.signature,'base64'));
const valid=r.signatureAlgorithm==='Ed25519'&&r.sha256===sha256&&signatureOk;
console.log(JSON.stringify({valid,envelopeId:r.payload?.envelopeId,eventCount:r.payload?.eventCount,sha256},null,2));
process.exitCode=valid?0:1;
