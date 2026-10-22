import {TenantWorkspaceShell} from '@/components/organization/tenant-workspace-shell';
export default function CompanyWorkspaceLayout({children}:{children:React.ReactNode}){
 return <TenantWorkspaceShell>{children}</TenantWorkspaceShell>;
}
