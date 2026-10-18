'use client';
import {useEffect,useState,FormEvent} from 'react';
import {request,patch} from '@/lib/api';
import {Panel,Field,Button,ErrorMessage,SuccessMessage} from '@/components/ui';

type Company={name:string;legalName:string|null;website:string|null;industry:string|null;description:string|null;idealCustomers:string|null;services:string[];country:string|null;timezone:string;defaultCurrency:string;logoUrl:string|null;billingAddress:string|null;taxRegistrationNumber:string|null;membershipRole:string};
const starting={name:'',legalName:'',website:'',industry:'',description:'',idealCustomers:'',services:'',logoUrl:'',country:'GB',timezone:'Europe/London',defaultCurrency:'GBP',billingAddress:'',taxRegistrationNumber:''};

export function CompanyProfilePanel(){
  const [form,setForm]=useState(starting),[pending,setPending]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState(''),[canEdit,setCanEdit]=useState(false);
  useEffect(()=>{request<Company>('/organizations/current').then(company=>{
    setCanEdit(['OWNER','ADMIN'].includes(company.membershipRole));
    setForm({name:company.name,legalName:company.legalName||'',website:company.website||'',industry:company.industry||'',description:company.description||'',idealCustomers:company.idealCustomers||'',services:Array.isArray(company.services)?company.services.join(', '):'',logoUrl:company.logoUrl||'',country:company.country||'GB',timezone:company.timezone,defaultCurrency:company.defaultCurrency,billingAddress:company.billingAddress||'',taxRegistrationNumber:company.taxRegistrationNumber||''});
  }).catch(e=>setError(e.message));},[]);
  function field(key:keyof typeof starting,value:string){setForm(prev=>({...prev,[key]:value}));}
  async function save(e:FormEvent){e.preventDefault();setPending(true);setError('');setSuccess('');
    try{await patch('/organizations/current',{...form,services:form.services.split(',').map(x=>x.trim()).filter(Boolean)});setSuccess('Company profile saved. This information will inform future AI company research and invoice generation.');}
    catch(e){setError(e instanceof Error?e.message:'Update failed.');}finally{setPending(false);}
  }
  return <Panel title="Company Profile & Commercial Identity">
    <p className="muted small-text">Your organization's business context is shared across research, sales and invoices. Billing details are required to issue real invoices.</p>
    <form className="stack-16" onSubmit={save}>
      <div className="field-grid">
        <Field label="Company name"><input disabled={!canEdit} required value={form.name} onChange={e=>field('name',e.target.value)}/></Field>
        <Field label="Legal company name"><input disabled={!canEdit} value={form.legalName} onChange={e=>field('legalName',e.target.value)}/></Field>
      </div>
      <div className="field-grid">
        <Field label="Website"><input disabled={!canEdit} type="url" value={form.website} onChange={e=>field('website',e.target.value)} placeholder="https://example.com"/></Field>
        <Field label="Industry"><input disabled={!canEdit} value={form.industry} onChange={e=>field('industry',e.target.value)}/></Field>
      </div>
      <Field label="Company logo URL (HTTPS)"><input disabled={!canEdit} type="url" value={form.logoUrl} onChange={e=>field('logoUrl',e.target.value)} placeholder="https://example.com/logo.png"/></Field>
      <Field label="Services (separated by commas)"><input disabled={!canEdit} value={form.services} onChange={e=>field('services',e.target.value)} placeholder="Data annotation, Quality assurance, BPO"/></Field>
      <Field label="What does your company do?"><textarea disabled={!canEdit} rows={3} value={form.description} onChange={e=>field('description',e.target.value)}/></Field>
      <Field label="Ideal customers"><textarea disabled={!canEdit} rows={2} value={form.idealCustomers} onChange={e=>field('idealCustomers',e.target.value)}/></Field>
      <div className="field-grid">
        <Field label="Country code"><input disabled={!canEdit} maxLength={2} value={form.country} onChange={e=>field('country',e.target.value.toUpperCase())}/></Field>
        <Field label="Default currency"><input disabled={!canEdit} maxLength={3} value={form.defaultCurrency} onChange={e=>field('defaultCurrency',e.target.value.toUpperCase())}/></Field>
      </div>
      <Field label="IANA time zone"><input disabled={!canEdit} value={form.timezone} onChange={e=>field('timezone',e.target.value)}/></Field>
      <Field label="Invoice issuing address"><textarea disabled={!canEdit} rows={2} value={form.billingAddress} onChange={e=>field('billingAddress',e.target.value)}/></Field>
      <Field label="VAT / tax registration identifier"><input disabled={!canEdit} value={form.taxRegistrationNumber} onChange={e=>field('taxRegistrationNumber',e.target.value)}/></Field>
      <ErrorMessage message={error}/><SuccessMessage text={success}/>
      {canEdit&&<Button loading={pending} type="submit">Save Company Profile</Button>}
    </form>
  </Panel>;
}
