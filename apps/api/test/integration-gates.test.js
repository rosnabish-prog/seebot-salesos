const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const source=name=>readFileSync(path.join(__dirname,'../src',name),'utf8');
test('Gmail sending is disabled unless explicitly enabled',()=>{
  assert.match(source('integrations/google/gmail-connection.service.ts'),/GMAIL_SENDING_ENABLED\s*!==\s*'true'/);
});
test('Google employee login requires an active existing account',()=>{
  assert.match(source('auth/google-login.controller.ts'),/!user\|\|!user\.active/);
  assert.match(source('auth/google-login.controller.ts'),/googleSubject&&user\.googleSubject!==verified\.subject/);
});
test('external organization creation is not exposed before tenant isolation',()=>{
  const org=source('organizations/organizations.controller.ts');
  assert.doesNotMatch(org,/@Post\(/);
  assert.match(org,/slug:'seebot'/);
});
test('outbound invitations refuse completed or revoked envelopes',()=>{
  assert.match(source('communications/outgoing-message.service.ts'),/env\.status!=='INVITED'/);
});
test('invoice issuance requires an approved invoice and private document hash',()=>{
  assert.match(source('invoices/invoice-pdf.service.ts'),/invoice\.status!=='APPROVED'/);
  assert.match(source('invoices/invoice-pdf.service.ts'),/sha256|digest/);
});
