import {STAGES,STAGE_FIELDS,StageId,StageField} from '@seebot/shared';

export type ExtraField=StageField & {key:string};
export type PipelineConfig={
  extraFields:Partial<Record<StageId,ExtraField[]>>;
  mappings:Partial<Record<StageId,Record<string,string>>>;
};
export const EMPTY_PIPELINE_CONFIG:PipelineConfig={extraFields:{},mappings:{}};
const stages=new Set<string>(STAGES.map(s=>s.id));
const sourceFixed=new Set(['account.name','account.domain','account.industry','account.hypothesis','opportunity.title','opportunity.serviceLine']);
const isRecord=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function configuredFields(config:PipelineConfig,stage:StageId):StageField[]{return [...STAGE_FIELDS[stage],...(config.extraFields[stage]||[])];}
export function validatePipelineConfig(input:unknown):PipelineConfig{
  if(!isRecord(input))throw Error('Pipeline configuration must be an object.');
  const extras=isRecord(input.extraFields)?input.extraFields:{};
  const mappings=isRecord(input.mappings)?input.mappings:{};
  if(Object.keys(input).some(k=>!['extraFields','mappings'].includes(k)))throw Error('Unknown workflow configuration section.');
  const out:PipelineConfig={extraFields:{},mappings:{}};
  for(const [stage,raw] of Object.entries(extras)){
    if(!stages.has(stage)||stage==='CLOSED_WON')throw Error('Invalid stage for custom evidence fields.');
    if(!Array.isArray(raw)||raw.length>8)throw Error('Each stage supports up to eight custom fields.');
    const known=new Set(STAGE_FIELDS[stage as StageId].map(f=>f.key));
    const fields:ExtraField[]=[];
    for(const field of raw){
      if(!isRecord(field)||typeof field.key!=='string'||!/^custom_[a-z][a-z0-9_]{1,30}$/.test(field.key)||known.has(field.key))throw Error('Invalid or duplicate custom field key.');
      if(typeof field.label!=='string'||field.label.trim().length<3||field.label.length>100)throw Error('Invalid custom field label.');
      if(!['text','textarea','date','select'].includes(String(field.type)))throw Error('Unsupported custom field type.');
      if(typeof field.required!=='boolean')throw Error('Custom fields must explicitly mark whether required.');
      if(field.options!==undefined&&(field.type!=='select'||!Array.isArray(field.options)||field.options.length<2||field.options.length>20||field.options.some((x:unknown)=>typeof x!=='string'||!x.trim()||x.length>90)))throw Error('Select fields require 2-20 nonempty options.');
      known.add(field.key);
      fields.push({key:field.key,label:field.label.trim(),type:field.type as StageField['type'],required:field.required,...(field.type==='select'?{options:field.options as string[]}:{})});
    }
    out.extraFields[stage as StageId]=fields;
  }
  for(const [stage,raw] of Object.entries(mappings)){
    if(!stages.has(stage)||stage==='ACCOUNT_RESEARCHED'||!isRecord(raw)||Object.keys(raw).length>20)throw Error('Invalid stage mapping.');
    const allowed=new Set(configuredFields(out,stage as StageId).map(f=>f.key));
    const values:Record<string,string>={};
    for(const [target,source] of Object.entries(raw)){
      if(!allowed.has(target)||typeof source!=='string')throw Error('Mappings must target a known field.');
      if(!sourceFixed.has(source)){
        if(!/^evidence\.[a-zA-Z][a-zA-Z0-9_]{0,50}$/.test(source))throw Error('Invalid evidence source.');
        const key=source.slice('evidence.'.length);
        const previous=STAGES.slice(0,STAGES.findIndex(x=>x.id===stage)).some(s=>configuredFields(out,s.id).some(f=>f.key===key));
        if(!previous)throw Error('Evidence sources must exist in an earlier stage.');
      }
      values[target]=source;
    }
    out.mappings[stage as StageId]=values;
  }
  return out;
}
export function safePipelineConfig(raw:unknown):PipelineConfig{
  try{return validatePipelineConfig(isRecord(raw)&&Object.keys(raw).length?raw:EMPTY_PIPELINE_CONFIG);}catch{return EMPTY_PIPELINE_CONFIG;}
}
