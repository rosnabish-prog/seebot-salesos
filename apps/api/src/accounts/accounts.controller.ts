import { Body, Controller, Get, Param, Post, Query, Req, UseGuards, BadRequestException, ConflictException } from '@nestjs/common';
import { AuthGuard,AuthRequest,allowManageAll,ensureCanEdit,ensureOwner } from '../common/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { OpportunityWorkflowService } from '../opportunities/workflow.service';
function normalizeDomain(input:string) {
  try {const v = input.includes('://')?input:`https://${input}`;let host=new URL(v).hostname.toLowerCase().replace(/^www\./,'');if (!host.includes('.')||host.includes(' ')||host.endsWith('.invalidtld')) throw Error();return host;} catch {throw new BadRequestException('Enter a valid company website/domain.');}
}
@UseGuards(AuthGuard) @Controller('accounts')
export class AccountsController {
  constructor(private db:PrismaService,private flow:OpportunityWorkflowService) {}
  @Get() async list(@Req() req:AuthRequest,@Query('q') q?:string) {
    const seebot=await this.db.organization.findUnique({where:{slug:'seebot'},select:{id:true}});if(!seebot)throw new BadRequestException('Organization bootstrap required.');
    const where:any={organizationId:seebot.id,...(allowManageAll(req.user)?{}:{ownerId:req.user.id})};
    if(q)where.OR=[{name:{contains:q,mode:'insensitive'}},{domain:{contains:q,mode:'insensitive'}}];
    return this.db.account.findMany({where,include:{owner:{select:{id:true,name:true}},opportunities:{select:{id:true,title:true,stage:true,status:true,updatedAt:true}}},orderBy:{updatedAt:'desc'},take:100});
  }
  @Post() async create(@Req() req:AuthRequest,@Body() body:{name:string;website:string;industry:string;priority?:string;hypothesis?:string;ownerId?:string}) {
    if(['CEO','DIRECTOR','TECHNICAL_REVIEWER'].includes(req.user.role)) throw new BadRequestException('Your role cannot create prospects.');
    if(!body.name?.trim()||!body.website?.trim()||!body.industry?.trim())throw new BadRequestException('Company, website and industry are required.');
    const activeIndustries=await this.db.industry.findMany({where:{active:true},select:{name:true}});
    const allowed=activeIndustries.length?activeIndustries.map(x=>x.name):['Sports Computer Vision','Autonomous Systems','Industrial AI','AI / NLP','Aerial Imagery','Insurance','Other'];
    if(!allowed.includes(body.industry))throw new BadRequestException('Choose an active industry.');
    const seebot=await this.db.organization.findUnique({where:{slug:'seebot'},select:{id:true}});if(!seebot)throw new BadRequestException('Seebot organization bootstrap required.');
    const domain=normalizeDomain(body.website), hypothesis=body.hypothesis?.trim()||'', existing=await this.db.account.findFirst({where:{domain,organizationId:seebot.id}});
    if(existing)throw new ConflictException({message:'An account with this domain already exists.',accountId:existing.id});
    const ownerId=allowManageAll(req.user)&&body.ownerId?body.ownerId:req.user.id;
    const account=await this.db.$transaction(async tx=> {
      const a=await tx.account.create({data:{organizationId:seebot.id,name:body.name.trim(),domain,website:`https://${domain}`,industry:body.industry,hypothesis,priority:(['LOW','MEDIUM','HIGH'].includes(body.priority||'')?body.priority:'MEDIUM') as any,ownerId}});
      const opportunity=await tx.opportunity.create({data:{accountId:a.id,title:`${a.name} — Initial Engagement`,ownerId,serviceLine:body.industry,stageVisits:{create:{stage:'ACCOUNT_RESEARCHED',evidence:hypothesis?{opportunityHypothesis:hypothesis}:{}}}}});
      await tx.task.create({data:{opportunityId:opportunity.id,assigneeId:ownerId,title:`Stage: Complete account research — ${a.name}`,description:'Fill the Research checklist in the opportunity workspace.'}});
      await tx.auditEvent.create({data:{actorId:req.user.id,entityType:'ACCOUNT',entityId:a.id,action:'ACCOUNT_CREATED',detail:{domain}}});
      return a;
    });
    return this.db.account.findUnique({where:{id:account.id},include:{opportunities:true}});
  }
  @Get(':id') async get(@Req()req:AuthRequest,@Param('id')id:string) {
    const account=await this.db.account.findUnique({where:{id},include:{contacts:true,opportunities:{include:{owner:{select:{name:true,id:true}}}},owner:{select:{id:true,name:true}}}});
    if(!account||account.organizationId!==req.user.organizationId)throw new BadRequestException('Account not found.');ensureOwner(req.user,account.ownerId);return account;
  }
  @Post(':id/contacts') async addContact(@Req()req:AuthRequest,@Param('id')id:string,@Body()body:{name:string;title:string;email?:string;linkedinUrl?:string;source:string;verified?:boolean}) {
    const account=await this.db.account.findUnique({where:{id}});if(!account||account.organizationId!==req.user.organizationId)throw new BadRequestException('Account not found.');ensureCanEdit(req.user,account.ownerId);
    if(!body.name?.trim()||!body.title?.trim()||!body.source?.trim()||(!body.email?.trim()&&!body.linkedinUrl?.trim()))throw new BadRequestException('Name, role, source and professional contact channel required.');
    if(body.email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email))throw new BadRequestException('Email is invalid.');
    const contact=await this.db.contact.create({data:{accountId:id,name:body.name.trim(),title:body.title.trim(),email:body.email?.trim().toLowerCase(),linkedinUrl:body.linkedinUrl?.trim(),source:body.source.trim(),verified:Boolean(body.verified)}});
    for(const opportunity of await this.db.opportunity.findMany({where:{accountId:id,stage:'DECISION_MAKER_IDENTIFIED',status:'OPEN'}}))await this.flow.tryAutoAdvance(opportunity.id,req.user.id);
    return contact;
  }
}
