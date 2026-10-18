import {createHash} from 'node:crypto';
import {GetObjectCommand,PutObjectCommand,S3Client} from '@aws-sdk/client-s3';
import {ServiceUnavailableException,ForbiddenException} from '@nestjs/common';

/**
 * Independently configured S3 Object Lock COMPLIANCE storage.
 * Requires a versioned bucket with Object Lock enabled, immutable retention, KMS and
 * an IAM role whose permissions are limited to this evidence prefix.
 * Never use a public bucket. Not a substitute for independent key custody.
 */
export class ImmutableEvidenceStore{
 private readonly client=new S3Client({});
 private settings(){
  if(process.env.NODE_ENV!=='production')return null;
  const bucket=process.env.SIGNING_EVIDENCE_OBJECT_LOCK_BUCKET||'';
  const kms=process.env.SIGNING_EVIDENCE_KMS_KEY_ARN||'';
  const days=Number(process.env.SIGNING_EVIDENCE_RETENTION_DAYS);
  if(!bucket||!kms||!Number.isSafeInteger(days)||days<365||days>36500)
   throw new ServiceUnavailableException('Production signing requires an immutable Object Lock bucket, KMS key and approved retention period.');
  return {bucket,kms,days};
 }
 private key(id:string){
  if(!/^[a-z0-9_-]{10,100}$/i.test(id))throw new ForbiddenException('Invalid evidence archive identifier.');
  return 'signing-evidence/v1/'+id+'.json';
 }
 private async get(bucket:string,key:string){
  const result=await this.client.send(new GetObjectCommand({Bucket:bucket,Key:key}));
  if(!result.Body)throw new ServiceUnavailableException('Immutable evidence object has no body.');
  return Buffer.from(await result.Body.transformToByteArray());
 }
 async persist(id:string,data:string){
  const config=this.settings();
  if(!config)return {enforced:false};
  const key=this.key(id),body=Buffer.from(data);
  try{
   await this.client.send(new PutObjectCommand({
    Bucket:config.bucket,Key:key,Body:body,
    ContentType:'application/json',IfNoneMatch:'*',
    ServerSideEncryption:'aws:kms',SSEKMSKeyId:config.kms,
    ObjectLockMode:'COMPLIANCE',
    ObjectLockRetainUntilDate:new Date(Date.now()+config.days*86400000)
   }));
  }catch(error:any){
   // A previous successful write may exist; fail unless it matches byte-for-byte.
   if(error?.$metadata?.httpStatusCode!==412)throw error;
  }
  await this.verify(id,data);
  return {enforced:true};
 }
 async verify(id:string,data:string){
  const config=this.settings();
  if(!config)return {enforced:false};
  const key=this.key(id),actual=await this.get(config.bucket,key);
  const expectedHash=createHash('sha256').update(data).digest('hex');
  const actualHash=createHash('sha256').update(actual).digest('hex');
  if(expectedHash!==actualHash)throw new ForbiddenException('Immutable offsite evidence does not match local receipt.');
  return {enforced:true,sha256:actualHash};
 }
}
