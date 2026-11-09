import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/services/prisma.service.js';

@Injectable()
export class MembershipRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUserId(userId: string) {
    return this.prisma.membership.findFirst({
      where: { userId },
      include: {
        plan: true,
      },
      orderBy: {
        endDate: 'desc', // Trae la membresía más reciente o vigente
      },
    });
  }
}