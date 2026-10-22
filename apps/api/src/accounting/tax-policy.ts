import {BadRequestException} from '@nestjs/common';
import {Prisma} from '@prisma/client';

export const TAX_TREATMENTS=['STANDARD','REDUCED','ZERO','EXEMPT','OUT_OF_SCOPE','REVERSE_CHARGE','OTHER_MANUAL'] as const;
export type TaxTreatment=typeof TAX_TREATMENTS[number];
export function taxRate(value:unknown,treatment:string):Prisma.Decimal{
 const raw=String(value??'').trim();
 if(!/^\d{1,3}(?:\.\d{1,4})?$/.test(raw))throw new BadRequestException('Tax rate must be a nonnegative percentage with up to four decimals.');
 const rate=new Prisma.Decimal(raw);
 if(rate.gt(100))throw new BadRequestException('Tax rate cannot exceed 100%.');
 if(['ZERO','EXEMPT','OUT_OF_SCOPE','REVERSE_CHARGE'].includes(treatment)&&!rate.isZero())
  throw new BadRequestException('This tax treatment requires zero tax on the invoice.');
 return rate;
}
export function taxTotals(subtotal:Prisma.Decimal,rate:Prisma.Decimal){
 const tax=subtotal.mul(rate).div(100).toDecimalPlaces(2,Prisma.Decimal.ROUND_HALF_UP);
 return {tax,total:subtotal.add(tax)};
}
export function taxRuleInput(body:any){
 const code=String(body?.code||'').trim().toUpperCase();
 const name=String(body?.name||'').trim(),jurisdiction=String(body?.jurisdiction||'').trim().toUpperCase();
 const treatment=String(body?.treatment||'').trim();
 if(!/^[A-Z][A-Z0-9_-]{2,39}$/.test(code)||name.length<3||name.length>120||!/^[A-Z]{2}$/.test(jurisdiction)||!TAX_TREATMENTS.includes(treatment as TaxTreatment))
  throw new BadRequestException('Tax rule code, name, jurisdiction and treatment are required.');
 const ratePercent=taxRate(body?.ratePercent,treatment);
 const effectiveFrom=body?.effectiveFrom?new Date(body.effectiveFrom):null;
 const effectiveTo=body?.effectiveTo?new Date(body.effectiveTo):null;
 if((effectiveFrom&&!Number.isFinite(effectiveFrom.getTime()))||(effectiveTo&&!Number.isFinite(effectiveTo.getTime()))||(effectiveFrom&&effectiveTo&&effectiveFrom>effectiveTo))
  throw new BadRequestException('Valid effective date interval required.');
 const invoiceNote=String(body?.invoiceNote||'').trim();
 if(invoiceNote.length>1000)throw new BadRequestException('Invoice note is too long.');
 return {code,name,jurisdiction,treatment,ratePercent,effectiveFrom,effectiveTo,invoiceNote:invoiceNote||null};
}
export function exportCsv(rows:Array<{code:string;name:string;jurisdiction:string;treatment:string;ratePercent:{toString():string}|string;status:string;invoiceNote:string|null}>){
 const quote=(s:string)=>'"'+s.replace(/"/g,'""')+'"';
 const head='code,name,jurisdiction,treatment,ratePercent,status,invoiceNote';
 return [head,...rows.map(r=>[r.code,r.name,r.jurisdiction,r.treatment,String(r.ratePercent),r.status,r.invoiceNote||''].map(x=>quote(x)).join(','))].join('\r\n')+'\r\n';
}

/** Parse a small UTF-8 CSV with quoted cells, escaped quotes and embedded commas/newlines. */
export function parseTaxCsv(source:unknown){
 if(typeof source!=='string'||source.length>65000)throw new BadRequestException('Upload CSV text up to 65 KB.');
 const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
 for(let i=0;i<source.length;i++){
  const ch=source[i];
  if(quoted){
   if(ch==='"'&&source[i+1]==='"'){cell+='"';i++;}
   else if(ch==='"')quoted=false;else cell+=ch;
  }else if(ch==='"'){if(cell.length)throw new BadRequestException('Unexpected quote in CSV.');quoted=true;}
  else if(ch===','){row.push(cell);cell='';}
  else if(ch==='\n'||ch==='\r'){
   if(ch==='\r'&&source[i+1]==='\n')i++;
   row.push(cell);cell='';
   if(row.some(x=>x.trim()))rows.push(row);
   row=[];
  }else cell+=ch;
 }
 if(quoted)throw new BadRequestException('Unclosed CSV quoted field.');
 row.push(cell);if(row.some(x=>x.trim()))rows.push(row);
 if(rows.length<2||rows.length>101)throw new BadRequestException('CSV requires a header and up to 100 rules.');
 const columns=['code','name','jurisdiction','treatment','ratePercent','status','invoiceNote'];
 if(rows[0].join(',')!==columns.join(','))throw new BadRequestException('Invalid CSV header. Export the template and preserve its columns.');
 const parsed=rows.slice(1).map(c=>{
  if(c.length!==columns.length)throw new BadRequestException('CSV row has the wrong column count.');
  if(c[4].trim()==='')throw new BadRequestException('Finance must specify a confirmed numeric rate for every imported rule.');
  return taxRuleInput({code:c[0],name:c[1],jurisdiction:c[2],treatment:c[3],ratePercent:c[4],invoiceNote:c[6]});
 });
 const unique=new Set(parsed.map(x=>x.code));
 if(unique.size!==parsed.length)throw new BadRequestException('Duplicate tax rule codes in CSV.');
 return parsed;
}
