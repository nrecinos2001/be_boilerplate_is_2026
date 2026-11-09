// src/membership/services/membership.service.ts
import { Injectable } from '@nestjs/common';
import { MembershipRepository } from '../repositories/membership.repository.js';
import type { MembershipStatusResponseDto } from '../dto/membership-status-response.dto.js';

@Injectable()
export class MembershipService {
  constructor(private readonly membershipRepository: MembershipRepository) {}

  async checkMembershipStatus(
    userId: string,
  ): Promise<MembershipStatusResponseDto> {
    const membership = await this.membershipRepository.findByUserId(userId);

    // Caso "Sin membresía": 200 con el resto en null (no 404).
    if (!membership) {
      return {
        id: null,
        planName: null,
        status: 'Sin membresía',
        endDate: null,
        remainingClasses: null,
      };
    }

    // ASUMIDO: una membresía CANCELLED no cuenta como vigente aunque su fecha no haya pasado.
    const notExpired = new Date(membership.endDate).getTime() >= Date.now();
    const isActive = notExpired && membership.status !== 'CANCELLED';

    return {
      id: membership.id,
      planName: membership.plan.name,
      status: isActive ? 'Vigente' : 'Vencida',
      endDate: membership.endDate,
      // TODO: Membership no guarda clases usadas/restantes. Definir campo o tabla con el equipo.
      remainingClasses: null,
    };
  }
}
