import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { UserRole } from '../generated/prisma/client.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { User } from '../generated/prisma/client.js';
import { ReservationsService } from './reservations.service.js';

@Controller()
@Roles(UserRole.CLIENTE)
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Post('reservations')
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: User, @Body() dto: any) {
    return this.reservations.create(user, dto);
  }
}