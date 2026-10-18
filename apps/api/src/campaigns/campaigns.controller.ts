import { Body,Controller,Get,Post,Delete,Param,Req,UseGuards,BadRequestException,ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard,AuthRequest,allowManageAll } from '../common/auth.guard';
@UseGuards(AuthGuard) @Controller('campaigns')
export class CampaignsController {
 constructor(private db:PrismaService){}
 @Get() list(@Req()req:AuthRequest){return this.db.campaign.findMany({where:allowManageAll(req.user)?{}:{ownerId:req.user.id},include:{accounts:{include:{account:{select:{id:true,name:true,domain:true,opportunities:{select:{status:true}}}}}}},orderBy:{createdAt:'desc'}});}
 @Post() create(@Req()req:AuthRequest,@Body()body:{name:string;sector:string;objective?:string}){
  if(['CEO','DIRECTOR','TECHNICAL_REVIEWER'].includes(req.user.role))throw new ForbiddenException('Read-only role.');
  if(!body.name?.trim()||!body.sector?.trim())throw new BadRequestException('Campaign name and sector required.');
  return this.db.campaign.create({data:{name:body.name.trim(),sector:body.sector,objective:body.objective?.trim(),ownerId:req.user.id}});
 }
 @Post(':id/accounts') async enroll(@Req()req:AuthRequest,@Param('id')id:string,@Body()body:{accountId:string}) {
  const campaign=await this.db.campaign.findUnique({where:{id}});
  if(!campaign)throw new BadRequestException('Campaign not found');
  if(['CEO','DIRECTOR','TECHNICAL_REVIEWER'].includes(req.user.role)||(!allowManageAll(req.user)&&campaign.ownerId!==req.user.id))throw new ForbiddenException();
  const account=await this.db.account.findUnique({where:{id:body.accountId}});
  if(!account||(!allowManageAll(req.user)&&account.ownerId!==req.user.id))throw new BadRequestException('Account not found or inaccessible');
  return this.db.campaignAccount.upsert({where:{campaignId_accountId:{campaignId:id,accountId:account.id}},create:{campaignId:id,accountId:account.id},update:{}});
 }
 @Delete(':id/accounts/:accountId') async remove(@Req()req:AuthRequest,@Param('id')id:string,@Param('accountId')accountId:string) {
  const campaign=await this.db.campaign.findUnique({where:{id}});
  if(!campaign)throw new BadRequestException('Campaign not found');
  if(['CEO','DIRECTOR','TECHNICAL_REVIEWER'].includes(req.user.role)||(!allowManageAll(req.user)&&campaign.ownerId!==req.user.id))throw new ForbiddenException();
  await this.db.campaignAccount.deleteMany({where:{campaignId:id,accountId}});
  return {ok:true};
 }
}
