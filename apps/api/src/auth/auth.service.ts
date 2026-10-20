import { Injectable, UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import argon2 from 'argon2';
@Injectable()
export class AuthService {
  constructor(private db: PrismaService) {}
  async login(email:string, password:string) {
    const user = await this.db.user.findUnique({where:{email:email.trim().toLowerCase()}});
    if (!user || !user.active || !(await argon2.verify(user.passwordHash,password))) throw new UnauthorizedException('Invalid email or password.');
    return {user:{id:user.id,email:user.email,name:user.name,role:user.role,passwordVersion:user.passwordVersion}};
  }
  async changePassword(userId:string,currentPassword:string,newPassword:string){
    const user=await this.db.user.findUnique({where:{id:userId}});
    if(!user||!currentPassword||!(await argon2.verify(user.passwordHash,currentPassword))) throw new UnauthorizedException('Current password is incorrect.');
    if(!newPassword||newPassword.length<12||newPassword.length>256||newPassword===currentPassword)throw new BadRequestException('Choose a new, different password of 12–256 characters.');
    const passwordHash=await argon2.hash(newPassword);
    await this.db.$transaction(async tx=>{
      await tx.user.update({where:{id:userId},data:{passwordHash,passwordVersion:{increment:1}}});
      await tx.loginChallenge.updateMany({where:{userId,consumedAt:null},data:{expiresAt:new Date(),consumedAt:new Date()}});
      await tx.auditEvent.create({data:{actorId:userId,action:'PASSWORD_CHANGED',entityType:'USER',entityId:userId,detail:{revokedPendingMfa:true}}});
    });
    return {success:true};
  }
  async createUser(actorRole:string, body:{email:string,name:string,password:string,role:string}) {
    if (actorRole!=='SUPER_ADMIN') throw new ForbiddenException('Only administrators can invite staff.');
    if (!body.password || body.password.length<12) throw new BadRequestException('Password must be at least 12 characters.');
    const roles = ['SUPER_ADMIN','CEO','DIRECTOR','SALES_MANAGER','SALES_REP','TECHNICAL_REVIEWER'];
    if (!roles.includes(body.role)) throw new BadRequestException('Invalid role.');
    const email=body.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new BadRequestException('Invalid email.');
    return this.db.user.create({data:{name:body.name,email,role:body.role as any,passwordHash:await argon2.hash(body.password)},select:{id:true,email:true,name:true,role:true}});
  }
}
