export const PRICING_MODELS=['FIXED','HOURLY','UNIT','MONTHLY_RETAINER','FTE','MILESTONE','OUTCOME'] as const;
export type PricingModel=typeof PRICING_MODELS[number];
export interface PricingInput {serviceName:string;model:PricingModel;rate:string;currency:string;unit:string|null;billingFrequency:string|null;notes:string|null}
const trim=(v:unknown,max:number)=>typeof v==='string'?v.trim().slice(0,max):'';
export function validatePricingLine(raw:unknown,contractCurrency?:string|null):PricingInput {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Pricing line must be an object.');
  const data=raw as Record<string,unknown>;
  const serviceName=trim(data.serviceName,160),model=trim(data.model,30) as PricingModel;
  const unit=trim(data.unit,80)||null, rate=String(data.rate??'').trim(),currency=trim(data.currency,3).toUpperCase();
  const billingFrequency=trim(data.billingFrequency,60)||null,notes=trim(data.notes,2000)||null;
  if(!serviceName)throw Error('Service or use case is required.');
  if(!PRICING_MODELS.includes(model))throw Error('Unsupported pricing model.');
  if(!/^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,6})?$/.test(rate)||Number(rate)<=0)throw Error('Rate must be positive with up to six decimal places.');
  if(!/^[A-Z]{3}$/.test(currency))throw Error('Valid three-letter currency required.');
  if(contractCurrency && contractCurrency!==currency)throw Error('Pricing currency must match the contract.');
  if(model==='UNIT'&&!unit)throw Error('Measurement unit is required for unit pricing.');
  return {serviceName,model,unit,rate,currency,billingFrequency,notes};
}
