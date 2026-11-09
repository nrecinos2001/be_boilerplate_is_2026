import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { MembershipService } from '../services/membership.service.js';

@ApiTags('Memberships')
@ApiBearerAuth()
@Controller('memberships')
export class MembershipController {
  constructor(private readonly membershipService: MembershipService) {}

  @Get(':userId/status')
  @ApiOperation({ summary: 'Consultar estatus de membresía' })
  async getStatus(@Param('userId') userId: string) {
    return await this.membershipService.checkMembershipStatus(userId);
  }
}