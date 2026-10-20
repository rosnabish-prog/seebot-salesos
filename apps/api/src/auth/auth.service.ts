import { Injectable, UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import argon2 from 'argon2';
@Injectable()
export class AuthService {
  constructor(private db: PrismaService, private jwt: JwtService) {}
  async login(email:string, password:string) {
    const user = await this.db.user.findUnique({where:{email:email.trim().toLowerCase()}});
    if (!user || !user.active || !(await argon2.verify(user.passwordHash,password))) throw new UnauthorizedException('Invalid email or password.');
    return user;
  }
  async changePassword(userId:string,currentPassword:string,newPassword:string){
    const user=await this.db.user.findUnique({where:{id:userId}});
    if(!user||!currentPassword||!(await argon2.verify(user.passwordHash,currentPassword))) throw new UnauthorizedException('Current password is incorrect.');
    if(!newPassword||newPassword.length<12||newPassword.length>256||newPassword===currentPassword)throw new BadRequestException('Choose a new, different password of 12–256 characters.');
    await this.db.user.update({where:{id:userId},data:{passwordHash:await argon2.hash(newPassword),passwordVersion:{increment:1}}});
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
