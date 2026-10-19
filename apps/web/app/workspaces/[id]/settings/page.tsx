'use client';
import {useParams} from 'next/navigation';
import {ShieldCheck} from 'lucide-react';
import {WorkspaceManagement} from '@/components/organization/workspace-management';
import {PipelineSettingsPanel} from '@/components/organization/pipeline-settings-panel';
import {Panel} from '@/components/ui';
import {TenantReportTemplates} from '@/components/client/tenant-report-templates';
import {TenantIntegrationStatus} from '@/components/organization/tenant-integration-status';
export default function TenantSettings(){
 const params=useParams(),orgId=String(params.id||'');
 return <><WorkspaceManagement embeddedWorkspaceId={orgId}/><div className="tenant-settings-extras">
  <PipelineSettingsPanel orgId={orgId}/>
  <TenantReportTemplates orgId={orgId}/>
  <TenantIntegrationStatus orgId={orgId}/>
  <Panel title="Security policy" actions={<ShieldCheck size={18}/>}><div className="security-policy-grid"><div><strong>Two-factor sign-in</strong><p>Required on every password or Google sign-in using a one-time code delivered to the verified company email.</p></div><div><strong>Session lifetime</strong><p>Authenticated sessions expire after seven days. Switching workspaces does not extend that expiry.</p></div><div><strong>Workspace isolation</strong><p>Company records are authorized through the selected workspace and active membership on every tenant route.</p></div></div></Panel>
 </div></>;
}
