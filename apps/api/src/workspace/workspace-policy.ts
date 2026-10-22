/** Tenant isolation boundary for legacy global CRM routes. */
export function mayAccessLegacySeebotWorkspace(workspaceSlug:string,membershipStatus:string){return workspaceSlug==='seebot'&&membershipStatus==='ACTIVE';}
export function normalizeSlug(value:string){const s=value.trim().toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'');if(s.length<3||s.length>60||s==='seebot')throw Error('Choose a different workspace identifier, 3–60 characters.');return s;}
export function assertWorkspaceScope(selectedId:string,recordOrganizationId:string){if(!selectedId||recordOrganizationId!==selectedId)throw Error('Cross-workspace access denied.');}

/** Workspace slugs are internal identifiers, not constraints on legal/display names.
 * Add a random suffix so short, multilingual, existing or reserved names can be used
 * without collisions or a user-visible "identifier" input.
 */
export function generateCompanySlug(name:string,randomSuffix:string):string{
 const ascii=String(name||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const normalized=ascii.replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,45).replace(/-+$/g,'');
 const base=normalized.length>=3?normalized:'company';
 if(!/^[a-f0-9]{10}$/.test(randomSuffix))throw Error('Invalid workspace identifier suffix.');
 return `${base}-${randomSuffix}`;
}
