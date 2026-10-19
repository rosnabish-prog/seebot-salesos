import {BadRequestException,Body,Controller,Get,Param,Post,Req,UseGuards,ForbiddenException} from '@nestjs/common';
import {IdentityGuard} from '../workspace/identity.guard';
import type {AuthRequest} from '../common/auth.guard';
import {PrismaService} from '../prisma/prisma.service';
import {JournalService} from './journal.service';
@UseGuards(IdentityGuard) @Controller('workspace-accounting')
export class JournalController{
 constructor(private db:PrismaService,private journal:JournalService){}
 private async verify(req:AuthRequest,orgId:string){
  if((req as any).selectedWorkspace!==orgId)throw new ForbiddenException('Select the company workspace.');
  const member=await this.db.organizationMembership.findUnique({where:{organizationId_userId:{organizationId:orgId,userId:req.user.id}}});
  if(!member||member.status!=='ACTIVE'||!['OWNER','ADMIN'].includes(member.role))throw new ForbiddenException('Company finance administrator required.');
 }
 @Get(':orgId/journals') async journals(@Req()req:AuthRequest,@Param('orgId')orgId:string){await this.verify(req,orgId);return this.journal.list(orgId);}
 @Get(':orgId/verify')async check(@Req()req:AuthRequest,@Param('orgId')orgId:string){await this.verify(req,orgId);return this.journal.verify(orgId);}
 @Get(':orgId/coverage')async coverage(@Req()req:AuthRequest,@Param('orgId')orgId:string){await this.verify(req,orgId);return this.journal.coverage(orgId);}
 @Post(':orgId/journals/:journalId/reverse')async reverse(@Req()req:AuthRequest,@Param('orgId')orgId:string,@Param('journalId')journalId:string,@Body()body:any){await this.verify(req,orgId);return this.journal.reverse(orgId,journalId,req.user.id,String(body?.reason||''));}
 @Get(':orgId/reconciliation')async reconciliation(@Req()req:AuthRequest,@Param('orgId')orgId:string){await this.verify(req,orgId);return this.journal.reconciliation(orgId);}
  @Post(':orgId/bank-rows')async bank(@Req()req:AuthRequest,@Param('orgId')orgId:string,@Body()body:any){await this.verify(req,orgId);return this.journal.importBankRow(orgId,req.user.id,body);}
 @Post(':orgId/bank-rows/:rowId/match')async match(@Req()req:AuthRequest,@Param('orgId')orgId:string,@Param('rowId')rowId:string,@Body()body:any){await this.verify(req,orgId);if(!body?.paymentId)throw new BadRequestException('Payment ID required.');return this.journal.match(orgId,rowId,String(body.paymentId),req.user.id);}
}
