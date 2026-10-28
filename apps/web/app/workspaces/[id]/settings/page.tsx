'use client';
import {useEffect,useMemo,useState} from 'react';
import {useParams} from 'next/navigation';
import {BarChart3,Building2,FileBarChart2,PlugZap,ShieldCheck,SlidersHorizontal} from 'lucide-react';
import {WorkspaceManagement} from '@/components/organization/workspace-management';
import {PipelineSettingsPanel} from '@/components/organization/pipeline-settings-panel';
import {TenantReportTemplates} from '@/components/client/tenant-report-templates';
import {TenantIntegrationStatus} from '@/components/organization/tenant-integration-status';
import {RecoveryCodesPanel} from '@/components/organization/recovery-codes-panel';
import {TenantSecurityAudit} from '@/components/organization/tenant-security-audit';
import {ErrorMessage,PageTop} from '@/components/ui';
import {request} from '@/lib/api';

type Profile={role:string;organization:{name:string}};
type Section='company'|'pipeline'|'reports'|'integrations'|'security';
export default function TenantSettings(){
 const params=useParams(),orgId=String(params.id||'');
 const [profile,setProfile]=useState<Profile|null>(null),[section,setSection]=useState<Section>('company'),[error,setError]=useState('');
 useEffect(()=>{void request<Profile>('/workspaces/'+orgId+'/profile').then(setProfile).catch(e=>setError(e instanceof Error?e.message:'Unable to load workspace settings.'))},[orgId]);
 const admin=['OWNER','ADMIN'].includes(profile?.role||'');
 const tabs=useMemo(()=>[
  {id:'company' as Section,label:'Company & Team',icon:<Building2 size={16}/>,show:true},
  {id:'pipeline' as Section,label:'Sales Workflow',icon:<SlidersHorizontal size={16}/>,show:admin},
  {id:'reports' as Section,label:'Client Reporting',icon:<FileBarChart2 size={16}/>,show:admin},
  {id:'integrations' as Section,label:'Integrations',icon:<PlugZap size={16}/>,show:true},
  {id:'security' as Section,label:'Security & Audit',icon:<ShieldCheck size={16}/>,show:true}
 ].filter(x=>x.show),[admin]);
 useEffect(()=>{if(!tabs.some(t=>t.id===section))setSection('company')},[tabs,section]);
 return <section className="tenant-settings-page">
  <PageTop kicker="WORKSPACE ADMINISTRATION" title="Team & Settings" description={'Configure '+(profile?.organization.name||'this workspace')+' without mixing company identity, pipeline rules, reporting, integrations and security controls into one long form.'}/>
  <ErrorMessage message={error}/>
  <div className="settings-layout">
   <aside className="settings-nav" aria-label="Workspace settings navigation">{tabs.map(tab=><button type="button" key={tab.id} className={section===tab.id?'active':''} onClick={()=>setSection(tab.id)}>{tab.icon}<span>{tab.label}</span></button>)}</aside>
   <div className="settings-content">
    {section==='company'&&<WorkspaceManagement embeddedWorkspaceId={orgId}/>}
    {section==='pipeline'&&admin&&<PipelineSettingsPanel orgId={orgId}/>}
    {section==='reports'&&admin&&<TenantReportTemplates orgId={orgId}/>}
    {section==='integrations'&&<TenantIntegrationStatus orgId={orgId}/>}
    {section==='security'&&<><RecoveryCodesPanel/>{admin&&<TenantSecurityAudit orgId={orgId}/>}</>}
   </div>
  </div>
 </section>;
}
