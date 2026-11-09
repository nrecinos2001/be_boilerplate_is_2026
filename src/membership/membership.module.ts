import { Module } from '@nestjs/common';
import { MembershipController } from './controllers/membership.controller.js';
import { MembershipService } from './services/membership.service.js';
import { MembershipRepository } from './repositories/membership.repository.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [MembershipController],
  providers: [MembershipService, MembershipRepository],
})
export class MembershipModule {}