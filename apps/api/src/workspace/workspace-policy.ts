/** Tenant isolation boundary for legacy global CRM routes. */
export function mayAccessLegacySeebotWorkspace(workspaceSlug:string,membershipStatus:string){return workspaceSlug==='seebot'&&membershipStatus==='ACTIVE';}
export function normalizeSlug(value:string){const s=value.trim().toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'');if(s.length<3||s.length>60||s==='seebot')throw Error('Choose a different workspace identifier, 3–60 characters.');return s;}
export function assertWorkspaceScope(selectedId:string,recordOrganizationId:string){if(!selectedId||recordOrganizationId!==selectedId)throw Error('Cross-workspace access denied.');}
