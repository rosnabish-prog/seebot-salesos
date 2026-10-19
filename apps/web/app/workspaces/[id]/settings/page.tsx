'use client';
import {useParams} from 'next/navigation';
import {WorkspaceManagement} from '@/components/organization/workspace-management';
export default function TenantSettings(){
 const params=useParams();
 return <WorkspaceManagement embeddedWorkspaceId={String(params.id||'')}/>;
}
