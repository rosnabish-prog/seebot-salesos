import { Controller,Get,UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../common/auth.guard';
import { providerReadiness } from './provider-status';
@UseGuards(AuthGuard) @Controller('integration-status')
export class IntegrationStatusController {
 @Get() status(){return providerReadiness(process.env);}
}
