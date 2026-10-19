'use client';
import {useParams} from 'next/navigation';
import WorkspacesPage from '../../page';
export default function TenantSettings(){
 const params=useParams();
 return <WorkspacesPage embeddedWorkspaceId={String(params.id||'')}/>;
}
