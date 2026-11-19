import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/services/prisma.service.js';

@Injectable()
export class LoyaltyService {
  constructor(private readonly db: PrismaService) {}

  // Procesar los puntos de fidelidad después de un pago aprobado.
  async processApprovedPayment(
    userId: string | null,
    paymentId: string,
    amount: number,
  ): Promise<void> {
    if (!userId) {
      return;
    }

    // La regla de conversión de dinero a puntos
    // debe configurarse cuando esté definida.
  }
}
