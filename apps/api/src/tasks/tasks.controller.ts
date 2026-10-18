import { Body,Controller,Get,Param,Patch,Post,Req,UseGuards,BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard,AuthRequest,allowManageAll,ensureCanEdit } from '../common/auth.guard';
@UseGuards(AuthGuard) @Controller('tasks')
export class TasksController {
  constructor(private db:PrismaService){}
  @Get() list(@Req()req:AuthRequest) {
    return this.db.task.findMany({where:allowManageAll(req.user)?{}:{assigneeId:req.user.id},include:{assignee:{select:{id:true,name:true}},opportunity:{select:{id:true,title:true,account:{select:{name:true}}}}},orderBy:[{status:'asc'},{dueAt:'asc'}],take:250});
  }
  @Post() async create(@Req()req:AuthRequest,@Body()body:{title:string;description?:string;dueAt?:string;opportunityId?:string;assigneeId?:string}) {
    if(['CEO','DIRECTOR','TECHNICAL_REVIEWER'].includes(req.user.role))throw new BadRequestException('Read-only role.');
    if(!body.title?.trim())throw new BadRequestException('Task title required.');
    let assigneeId=allowManageAll(req.user)&&body.assigneeId?body.assigneeId:req.user.id;
    if(body.opportunityId){const opp=await this.db.opportunity.findUnique({where:{id:body.opportunityId}});if(!opp)throw new BadRequestException('Opportunity not found.');ensureCanEdit(req.user,opp.ownerId);}
    const dueAt=body.dueAt?new Date(body.dueAt):undefined;if(dueAt&&Number.isNaN(dueAt.valueOf()))throw new BadRequestException('Invalid date.');
    return this.db.task.create({data:{title:body.title.trim(),description:body.description,dueAt,opportunityId:body.opportunityId||null,assigneeId}});
  }
  @Patch(':id') async update(@Req()req:AuthRequest,@Param('id')id:string,@Body()body:{status?:'OPEN'|'DONE'|'CANCELLED';dueAt?:string|null;title?:string;description?:string}) {
    const task=await this.db.task.findUnique({where:{id}});if(!task)throw new BadRequestException('Task not found.');ensureCanEdit(req.user,task.assigneeId);
    if(body.status!==undefined&&!['OPEN','DONE','CANCELLED'].includes(body.status))throw new BadRequestException('Invalid status.');
    const data:any={};if(body.status!==undefined){data.status=body.status;data.completedAt=body.status==='DONE'?new Date():null;}
    if(body.dueAt!==undefined){const due=body.dueAt?new Date(body.dueAt):null;if(due&&Number.isNaN(due.valueOf()))throw new BadRequestException('Invalid due date.');data.dueAt=due;}
    if(body.title!==undefined){if(!body.title.trim())throw new BadRequestException('Title required.');data.title=body.title.trim().slice(0,200);}
    if(body.description!==undefined)data.description=body.description.slice(0,4000);
    if(!Object.keys(data).length)throw new BadRequestException('No changes.');
    return this.db.task.update({where:{id},data});
  }
}
