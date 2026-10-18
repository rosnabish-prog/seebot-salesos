import { BadRequestException, Body, Controller, ForbiddenException, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard, AuthRequest } from '../common/auth.guard';
const safe = (v:unknown,max=1000) => typeof v==='string'?v.trim().slice(0,max):'';
@UseGuards(AuthGuard) @Controller('organizations')
export class OrganizationsController {
  constructor(private readonly db: PrismaService) {}
  private async seebot(userId:string) {
    const organization=await this.db.organization.findUnique({where:{slug:'seebot'}});
    if (!organization) throw new ForbiddenException('Organization bootstrap has not been completed.');
    const member=await this.db.organizationMembership.findUnique({where:{organizationId_userId:{organizationId:organization.id,userId}}});
    if (!member || member.status!=='ACTIVE') throw new ForbiddenException('No active Seebot workspace membership.');
    return {organization,member};
  }
  @Get('current') async current(@Req()req:AuthRequest) {
    const {organization,member}=await this.seebot(req.user.id);
    return { ...organization, membershipRole:member.role, multiOrganizationEnabled:false };
  }
  @Patch('current') async update(@Req()req:AuthRequest,@Body()body:Record<string,unknown>) {
    const {organization,member}=await this.seebot(req.user.id);
    if(member.role!=='OWNER' && member.role!=='ADMIN') throw new ForbiddenException('Workspace administrator required.');
    if(!body || typeof body!=='object'||Array.isArray(body))throw new BadRequestException('Invalid profile.');
    const updates:any={};
    for(const key of ['name','legalName','website','industry','description','idealCustomers','country','timezone','defaultCurrency','billingAddress','taxRegistrationNumber','logoUrl'] as const){
      if(Object.prototype.hasOwnProperty.call(body,key)){
        if(typeof body[key]!=='string') throw new BadRequestException(`${key} must be text.`);
        updates[key]=safe(body[key],key==='description'||key==='idealCustomers'?4000:250);
      }
    }
    if(updates.name!==undefined && updates.name.length<2)throw new BadRequestException('Company name must have at least two characters.');
    if(updates.logoUrl && !/^https:\/\/[^\s]+$/i.test(updates.logoUrl))throw new BadRequestException('Logo must be an HTTPS image URL.');
    if(updates.website && !/^https:\/\/[a-z0-9.-]+(?:\/[a-z0-9/_?=&%.-]*)?$/i.test(updates.website))throw new BadRequestException('Website must be an HTTPS URL.');
    if(updates.defaultCurrency && !/^[A-Z]{3}$/.test(updates.defaultCurrency))throw new BadRequestException('Currency must be ISO 4217 code.');
    if(updates.country && !/^[A-Z]{2}$/.test(updates.country))throw new BadRequestException('Country must be a two-letter country code.');
    if(updates.timezone && !/^[A-Za-z_]+\/[A-Za-z_+-]+(?:\/[A-Za-z_+-]+)?$/.test(updates.timezone))throw new BadRequestException('Timezone must be an IANA zone.');
    if(Object.prototype.hasOwnProperty.call(body,'services')){
      if(!Array.isArray(body.services)||body.services.length>40||body.services.some(v=>typeof v!=='string'||v.length>120))throw new BadRequestException('Services must be up to 40 names.');
      updates.services=body.services.map(v=>v.trim()).filter(Boolean);
    }
    return this.db.organization.update({where:{id:organization.id},data:updates});
  }
}
