import { Body, Controller, ForbiddenException, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthRequest } from '../common/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
@UseGuards(AuthGuard) @Controller('users')
export class UsersController {
  constructor(private db:PrismaService, private auth:AuthService) {}
  @Get() list(@Req() req:AuthRequest) {
    // Staff directory includes identity but never credentials.
    return this.db.user.findMany({where:{active:true},select:{id:true,name:true,email:true,role:true},orderBy:{name:'asc'}});
  }
  @Post() invite(@Req() req:AuthRequest,@Body() body:{name:string,email:string,password:string,role:string}) {
    if(process.env.NODE_ENV==='production'||process.env.ALLOW_DIRECT_USER_PROVISIONING!=='true')throw new ForbiddenException('Use verified employee invitations. Direct credential provisioning is disabled.');
    return this.auth.createUser(req.user.role,body);
  }
}
