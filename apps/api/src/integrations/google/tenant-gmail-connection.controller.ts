import {Controller,Get,Param,Post,Req,UseGuards} from '@nestjs/common';
import {IdentityGuard} from '../../workspace/identity.guard';
import {TenantScopeService,type ScopedRequest} from '../../workspace/tenant-scope.service';
import {GmailConnectionService} from './gmail-connection.service';

@UseGuards(IdentityGuard)
@Controller('workspace-integrations/:orgId/gmail')
export class TenantGmailConnectionController{
 constructor(private gmail:GmailConnectionService,private scope:TenantScopeService){}
 private async access(req:ScopedRequest,orgId:string){await this.scope.membership(req,orgId,'mail');}
 @Get('status')async status(@Req()req:ScopedRequest,@Param('orgId')orgId:string){await this.access(req,orgId);return this.gmail.status(req.user.id);}
 @Post('connect')async connect(@Req()req:ScopedRequest,@Param('orgId')orgId:string){await this.access(req,orgId);return this.gmail.connectUrl(req.user.id);}
 @Post('disconnect')async disconnect(@Req()req:ScopedRequest,@Param('orgId')orgId:string){await this.access(req,orgId);return this.gmail.disconnect(req.user.id);}
}
