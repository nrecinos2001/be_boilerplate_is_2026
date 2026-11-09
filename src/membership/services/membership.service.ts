import { Injectable, NotFoundException } from '@nestjs/common';
import { MembershipRepository } from '../repositories/membership.repository.js';

@Injectable()
export class MembershipService {
  constructor(private readonly membershipRepository: MembershipRepository) {}

  async checkMembershipStatus(userId: string) {
    const membership = await this.membershipRepository.findByUserId(userId);

    if (!membership) {
      throw new NotFoundException(`No se encontró ninguna membresía registrada para el usuario con ID: ${userId}`);
    }

    const currentDate = new Date();
    const isActive = new Date(membership.endDate) >= currentDate;

    return {
      userId: membership.userId,
      status: isActive ? 'ACTIVE' : 'EXPIRED',
      startDate: membership.startDate,
      endDate: membership.endDate,
      plan: {
        name: membership.plan.name,
        price: membership.plan.price,
      },
    };
  }
}