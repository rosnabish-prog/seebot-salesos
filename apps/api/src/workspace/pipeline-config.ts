import {BadRequestException} from '@nestjs/common';
import {STAGES,STAGE_FIELDS,type FieldType,type StageField,type StageId} from '@seebot/shared';

export const AUTOFILL_SOURCES=[
 'account.name','account.website','account.industry','account.country','account.hypothesis',
 'opportunity.title','opportunity.serviceLine','opportunity.currency',
 'primaryContact.name','primaryContact.email','primaryContact.title',
 'latestContract.title','latestContract.status'
] as const;
export type AutoFillSource=typeof AUTOFILL_SOURCES[number];
export type ConfiguredStageField=StageField&{autoFill?:AutoFillSource};
export type PipelineStageConfig={id:StageId;label:string;short:string;fields:ConfiguredStageField[]};
export type PipelineConfig={version:1;stages:PipelineStageConfig[]};

export function defaultPipelineConfig():PipelineConfig{
 return {version:1,stages:STAGES.map(stage=>({id:stage.id,label:stage.label,short:stage.short,fields:STAGE_FIELDS[stage.id].map(field=>({...field}))}))};
}
export function parsePipelineConfig(raw:unknown):PipelineConfig{
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||!Array.isArray((raw as any).stages))return defaultPipelineConfig();
 try{return validatePipelineConfig(raw);}catch{return defaultPipelineConfig();}
}
export function validatePipelineConfig(raw:unknown):PipelineConfig{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BadRequestException('Pipeline configuration must be an object.');
 const source=raw as any;
 if(!Array.isArray(source.stages)||source.stages.length!==STAGES.length)throw new BadRequestException('Pipeline must contain all 11 canonical stages.');
 const ids=new Set<string>(),stages:PipelineStageConfig[]=[];
 for(const rawStage of source.stages){
  const id=String(rawStage?.id||'') as StageId;
  if(!STAGES.some(s=>s.id===id)||ids.has(id))throw new BadRequestException('Pipeline stage IDs must be unique canonical stage identifiers.');
  ids.add(id);
  const base=STAGES.find(s=>s.id===id)!;
  const label=String(rawStage?.label||base.label).trim(),short=String(rawStage?.short||base.short).trim();
  if(label.length<2||label.length>80||short.length<1||short.length>40)throw new BadRequestException('Stage names are too long or empty.');
  if(!Array.isArray(rawStage?.fields)||rawStage.fields.length>25)throw new BadRequestException('Each stage may contain up to 25 evidence fields.');
  const keys=new Set<string>(),fields:ConfiguredStageField[]=[];
  for(const rawField of rawStage.fields){
   const key=String(rawField?.key||'').trim(),fieldLabel=String(rawField?.label||'').trim(),type=String(rawField?.type||'text') as FieldType;
   if(!/^[a-zA-Z][a-zA-Z0-9_]{0,59}$/.test(key)||keys.has(key))throw new BadRequestException('Evidence field keys must be unique identifiers.');
   if(fieldLabel.length<2||fieldLabel.length>160||!['text','textarea','date','select','checkbox'].includes(type))throw new BadRequestException('Evidence fields require a valid label and type.');
   keys.add(key);
   const field:ConfiguredStageField={key,label:fieldLabel,type,required:Boolean(rawField?.required)};
   if(rawField?.help){const help=String(rawField.help).trim();if(help.length>500)throw new BadRequestException('Field help text is too long.');field.help=help;}
   if(type==='select'){
    if(!Array.isArray(rawField?.options)||rawField.options.length<1||rawField.options.length>30)throw new BadRequestException('Select fields need 1–30 options.');
    const options=rawField.options.map((v:any)=>String(v).trim()).filter(Boolean);
    if(options.length!==rawField.options.length||new Set(options).size!==options.length||options.some((v:string)=>v.length>120))throw new BadRequestException('Select options must be unique short labels.');
    field.options=options;
   }
   if(rawField?.autoFill){const autoFill=String(rawField.autoFill) as AutoFillSource;if(!AUTOFILL_SOURCES.includes(autoFill))throw new BadRequestException('Unknown auto-fill source.');field.autoFill=autoFill;}
   fields.push(field);
  }
  stages.push({id,label,short,fields});
 }
 // Preserve canonical order even when the editor sends rows out of order.
 return {version:1,stages:STAGES.map(base=>stages.find(s=>s.id===base.id)!)};
}
export function stageConfig(config:PipelineConfig,id:string){return config.stages.find(stage=>stage.id===id as StageId);}
