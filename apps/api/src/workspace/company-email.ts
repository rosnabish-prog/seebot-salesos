import {BadRequestException} from '@nestjs/common';
/** A corporate-looking domain is not proof of employment: verification of mailbox control is separate. */
export const PERSONAL_MAIL_DOMAINS=new Set([
 'gmail.com','googlemail.com','yahoo.com','yahoo.co.uk','ymail.com','rocketmail.com','hotmail.com','hotmail.co.uk',
 'outlook.com','outlook.co.uk','live.com','live.co.uk','msn.com','aol.com','icloud.com','me.com','mac.com',
 'proton.me','protonmail.com','pm.me','tutanota.com','tuta.io','tuta.com','mail.com','gmx.com','gmx.net',
 'zoho.com','yandex.com','yandex.ru','qq.com','163.com','126.com','naver.com','daum.net',
 'hey.com','fastmail.com','fastmail.fm','inbox.com','rediffmail.com'
]);
export function companyDomain(email:string):string{
 const normalized=String(email||'').trim().toLowerCase();
 if(!/^[^\s@]+@([a-z0-9-]+\.)+[a-z]{2,}$/i.test(normalized)||normalized.length>254)throw new BadRequestException('Enter a valid work email address.');
 const domain=normalized.split('@')[1];
 if(PERSONAL_MAIL_DOMAINS.has(domain))throw new BadRequestException('Use your company work email. Personal email providers cannot create a company workspace.');
 return domain;
}
export function assertWebsiteEmailMatch(email:string,website:string){
 const domain=companyDomain(email);
 if(!website)return domain;
 let host='';
 try{const parsed=new URL(website);if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.port)throw Error('invalid');host=parsed.hostname.toLowerCase().replace(/\.$/,'').replace(/^www\./,'');}
 catch{throw new BadRequestException('Enter a valid HTTPS company website.');}
 if(host!==domain&&!host.endsWith('.'+domain)&&!domain.endsWith('.'+host))
  throw new BadRequestException('The website domain must match your company email domain. Use your company website or leave it empty for now.');
 return domain;
}
