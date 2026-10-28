require('./register-ts.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {WorkspaceAccessService,assertWorkspacePermission}=require('../src/workspace/workspace-access.service.ts');
test('finance access is independent from sales editing and global platform role',()=>{
 assert.doesNotThrow(()=>assertWorkspacePermission('FINANCE','finance'));
 assert.doesNotThrow(()=>assertWorkspacePermission('FINANCE','mail'));
 assert.throws(()=>assertWorkspacePermission('FINANCE','sales'));
 assert.throws(()=>assertWorkspacePermission('MEMBER','finance'));
 assert.throws(()=>assertWorkspacePermission('SUPER_ADMIN','admin'));
 for(const role of ['OWNER','ADMIN'])for(const permission of ['read','sales','finance','admin','mail'])assert.doesNotThrow(()=>assertWorkspacePermission(role,permission));
 assert.doesNotThrow(()=>assertWorkspacePermission('VIEWER','read'));
 for(const permission of ['sales','finance','admin','mail'])assert.throws(()=>assertWorkspacePermission('VIEWER',permission));
});
test('selected tenant, membership status and organization status all constrain access',async()=>{
 let member={role:'FINANCE',status:'ACTIVE',organization:{status:'ACTIVE'}};
 const access=new WorkspaceAccessService({organizationMembership:{findUnique:async()=>member}});
 const req={user:{id:'one',role:'SUPER_ADMIN'},selectedWorkspace:'a'};
 assert.equal((await access.require(req,'a','finance')).role,'FINANCE');
 await assert.rejects(access.require(req,'b','finance'));
 member={...member,status:'DISABLED'};await assert.rejects(access.require(req,'a'));
 member={...member,status:'ACTIVE',organization:{status:'SUSPENDED'}};await assert.rejects(access.require(req,'a'));
 member=null;await assert.rejects(access.require(req,'a'));
});
