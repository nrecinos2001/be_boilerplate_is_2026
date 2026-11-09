// src/membership/controllers/membership.controller.ts
import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '@Auth/decorators';
import { MembershipService } from '../services/membership.service.js';
import { MembershipStatusResponseDto } from '../dto/membership-status-response.dto.js';

// El esquema de seguridad se registró en main.ts con el nombre 'access-token'.
@ApiTags('Memberships')
@ApiBearerAuth('access-token')
@Controller('memberships')
export class MembershipController {
  constructor(private readonly membershipService: MembershipService) {}

  @Get('me')
  @ApiOperation({ summary: 'Consultar el estado de mi membresía' })
  @ApiResponse({ status: 200, type: MembershipStatusResponseDto })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  getMine(@CurrentUser() user: { id: string }) {
    return this.membershipService.checkMembershipStatus(user.id);
  }

  @Get(':userId/status')
  @ApiOperation({
    summary: 'Consultar el estado de membresía de un miembro (solo el propio)',
  })
  @ApiResponse({ status: 200, type: MembershipStatusResponseDto })
  @ApiResponse({ status: 400, description: 'userId no es un UUID válido' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({
    status: 403,
    description: 'No puede consultar la membresía de otro miembro',
  })
  getStatus(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: { id: string },
  ) {
    if (user.id !== userId) {
      throw new ForbiddenException(
        'No puedes consultar la membresía de otro miembro',
      );
    }
    return this.membershipService.checkMembershipStatus(userId);
  }
}
