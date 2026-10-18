import { BadRequestException, Controller, Delete, Get, Param, Patch, Post, Body, Req, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard,AuthRequest,ensureCanEdit,ensureOwner } from '../common/auth.guard';
import {validatePricingLine} from './pricing-validation';
@UseGuards(AuthGuard) @Controller('contracts')
export class ContractPricingController {
  constructor(private readonly db:PrismaService) {}
  private async contract(id:string,user:AuthRequest['user'],modify=false){
    const c=await this.db.contract.findUnique({where:{id},include:{opportunity:true}});
    if(!c)throw new BadRequestException('Contract not found.');
    if(modify){ensureCanEdit(user,c.opportunity.ownerId);if(c.status!=='DRAFT')throw new BadRequestException('The contract is no longer a draft. Create an amendment instead of editing agreed pricing.');}
    else ensureOwner(user,c.opportunity.ownerId);
    return c;
  }
  @Get(':id/pricing') async list(@Req()req:AuthRequest,@Param('id')id:string){
    await this.contract(id,req.user);
    const effective=await this.db.contractAmendment.findFirst({where:{contractId:id,status:'APPROVED',effectiveAt:{lte:new Date()}},orderBy:[{effectiveAt:'desc'},{version:'desc'}]});
    if(effective && Array.isArray(effective.pricingSnapshot))return (effective.pricingSnapshot as any[]).map((line,index)=>({...line,id:`amendment:${effective.id}:${index}`,version:effective.version,effectiveAt:effective.effectiveAt}));
    return this.db.contractPricingLine.findMany({where:{contractId:id},orderBy:{createdAt:'asc'}});
  }
  @Post(':id/pricing') async add(@Req()req:AuthRequest,@Param('id')id:string,@Body()body:unknown){
    const contract=await this.contract(id,req.user,true);
    let data;try{data=validatePricingLine(body,contract.currency)}catch(e){throw new BadRequestException((e as Error).message)}
    const line=await this.db.contractPricingLine.create({data:{contractId:id,...data}});
    await this.db.auditEvent.create({data:{actorId:req.user.id,action:'CONTRACT_PRICING_ADDED',entityType:'CONTRACT',entityId:id,detail:{lineId:line.id,model:line.model,demo:contract.isDemo}}});
    return line;
  }
  @Patch(':id/pricing/:lineId') async edit(@Req()req:AuthRequest,@Param('id')id:string,@Param('lineId')lineId:string,@Body()body:unknown){
    const contract=await this.contract(id,req.user,true);
    const existing=await this.db.contractPricingLine.findFirst({where:{id:lineId,contractId:id}});
    if(!existing)throw new BadRequestException('Pricing line not found.');
    let data;try{data=validatePricingLine(body,contract.currency)}catch(e){throw new BadRequestException((e as Error).message)}
    const line=await this.db.contractPricingLine.update({where:{id:existing.id},data});
    await this.db.auditEvent.create({data:{actorId:req.user.id,action:'CONTRACT_PRICING_EDITED',entityType:'CONTRACT',entityId:id,detail:{lineId:line.id}}});
    return line;
  }
  @Delete(':id/pricing/:lineId') async remove(@Req()req:AuthRequest,@Param('id')id:string,@Param('lineId')lineId:string){
    await this.contract(id,req.user,true);
    const existing=await this.db.contractPricingLine.findFirst({where:{id:lineId,contractId:id}});
    if(!existing)throw new BadRequestException('Pricing line not found.');
    await this.db.contractPricingLine.delete({where:{id:existing.id}});
    await this.db.auditEvent.create({data:{actorId:req.user.id,action:'CONTRACT_PRICING_DELETED',entityType:'CONTRACT',entityId:id,detail:{lineId}}});
    return {success:true};
  }
}
