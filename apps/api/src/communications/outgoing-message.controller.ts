import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthRequest } from '../common/auth.guard';
import { OutgoingMessageService } from './outgoing-message.service';
@UseGuards(AuthGuard) @Controller('communications/messages')
export class OutgoingMessageController {
  constructor(private readonly messages:OutgoingMessageService){}
  @Get(':id') status(@Req()req:AuthRequest,@Param('id')id:string){return this.messages.status(id,req.user.id);}
  @Post(':id/send') send(@Req()req:AuthRequest,@Param('id')id:string){return this.messages.send(id,req.user.id);}
}
