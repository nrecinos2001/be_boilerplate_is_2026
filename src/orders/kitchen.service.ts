import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  NotificationSource,
  UserRole,
} from '../generated/prisma/client.js';
import type { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/services/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { KitchenGateway } from './kitchen.gateway.js';

@Injectable()
export class KitchenService {
  constructor(
    private readonly db: PrismaService,
    private readonly kitchen: KitchenGateway,
    private readonly notifications: NotificationsService,
  ) {}

  private async checkBranch(user: User, branchId: string) {
    const assignment = await this.db.staffBranch.findUnique({
      where: {
        userId_branchId: {
          userId: user.id,
          branchId,
        },
      },
    });

    if (!assignment) {
      throw new ForbiddenException(
        'No tienes acceso a esta sucursal',
      );
    }
  }

  async getOrdersInPreparation(user: User) {
    if (user.role !== UserRole.COCINA) {
      throw new ForbiddenException(
        'Solo el personal de cocina puede consultar comandas',
      );
    }

    const assignments = await this.db.staffBranch.findMany({
      where: { userId: user.id },
      select: { branchId: true },
    });

    const branchIds = assignments.map(
      (assignment) => assignment.branchId,
    );

    if (branchIds.length === 0) {
      return [];
    }

    return this.db.order.findMany({
      where: {
        branchId: { in: branchIds },
        status: 'IN_PREPARATION',
      },
      include: {
        items: {
          include: {
            dish: {
              select: {
                name: true,
              },
            },
          },
        },
        account: {
          include: {
            table: {
              select: {
                number: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async markItemReady(
    user: User,
    orderId: string,
    itemId: string,
    status: 'Listo',
  ) {
    if (user.role !== UserRole.COCINA) {
      throw new ForbiddenException(
        'Solo cocina puede realizar esta acción',
      );
    }

    if (status !== 'Listo') {
      throw new ConflictException('Estado solicitado no permitido');
    }

    const result = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM orders
        WHERE id = ${orderId}::uuid
        FOR UPDATE
      `;

      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });

      if (!order) {
        throw new NotFoundException('Comanda inexistente');
      }

      await this.checkBranch(user, order.branchId);

      if (order.status !== 'IN_PREPARATION') {
        throw new ConflictException(
          'La comanda no está en preparación',
        );
      }

      const item = order.items.find((entry) => entry.id === itemId);

      if (!item) {
        throw new NotFoundException(
          'El platillo no pertenece a esta comanda',
        );
      }

      if (item.status !== 'IN_PREPARATION') {
        throw new ConflictException(
          'El platillo no está en preparación o ya fue terminado',
        );
      }

      const updated = await tx.orderItem.update({
        where: { id: itemId },
        data: { status: 'READY' },
      });

      return {
        id: order.id,
        branchId: order.branchId,
        itemId: updated.id,
        status: 'Listo',
      };
    });

    this.kitchen.orderUpdated(result.branchId, result);

    return {
      id: result.itemId,
      orderId: result.id,
      status: result.status,
    };
  }

  async markOrderReady(
    user: User,
    orderId: string,
    status: 'Listo',
  ) {
    if (user.role !== UserRole.COCINA) {
      throw new ForbiddenException(
        'Solo cocina puede realizar esta acción',
      );
    }

    if (status !== 'Listo') {
      throw new ConflictException('Estado solicitado no permitido');
    }

    const result = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM orders
        WHERE id = ${orderId}::uuid
        FOR UPDATE
      `;

      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          items: true,
          account: {
            select: {
              waiterId: true,
            },
          },
        },
      });

      if (!order) {
        throw new NotFoundException('Comanda inexistente');
      }

      await this.checkBranch(user, order.branchId);

      if (order.status !== 'IN_PREPARATION') {
        throw new ConflictException(
          'La comanda no está en preparación',
        );
      }

      if (
        order.items.length === 0 ||
        order.items.some((item) => item.status !== 'READY')
      ) {
        throw new ConflictException(
          'No se puede marcar la comanda lista: hay platillos pendientes',
        );
      }

      if (!order.account?.waiterId) {
        throw new ConflictException(
          'La comanda no tiene un mesero responsable asignado',
        );
      }

      await tx.order.update({
        where: { id: orderId },
        data: { status: 'READY' },
      });

      return {
        id: order.id,
        branchId: order.branchId,
        waiterId: order.account.waiterId,
      };
    });

    await this.notifications.send({
      recipientIds: [result.waiterId],
      title: 'Comanda lista',
      message: `La comanda ${result.id} está lista para entregar.`,
      sourceModule: NotificationSource.COCINA,
      referenceType: 'Order',
      referenceId: result.id,
    });

    this.kitchen.orderUpdated(result.branchId, {
      id: result.id,
      status: 'Listo',
    });

    return {
      id: result.id,
      status: 'Listo',
    };
  }

  async readyForDelivery(user: User) {
    if (user.role !== UserRole.MESERO) {
      throw new ForbiddenException(
        'Solo meseros pueden consultar entregas',
      );
    }

    const assignments = await this.db.staffBranch.findMany({
      where: { userId: user.id },
      select: { branchId: true },
    });

    if (assignments.length !== 1) {
      throw new ForbiddenException(
        'El mesero debe estar asignado a una sola sucursal',
      );
    }

    const branchId = assignments[0].branchId;

    return this.db.order.findMany({
      where: {
        branchId,
        status: 'READY',
        account: {
          waiterId: user.id,
        },
      },
      include: {
        items: {
          include: {
            dish: {
              select: { name: true },
            },
          },
        },
        account: {
          include: {
            table: {
              select: { number: true },
            },
          },
        },
      },
      orderBy: { updatedAt: 'asc' },
    });
  }

  async markDelivered(user: User, orderId: string) {
    if (user.role !== UserRole.MESERO) {
      throw new ForbiddenException(
        'Solo un mesero puede confirmar la entrega',
      );
    }

    const result = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM orders
        WHERE id = ${orderId}::uuid
        FOR UPDATE
      `;

      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          account: true,
        },
      });

      if (!order) {
        throw new NotFoundException('Comanda inexistente');
      }

      await this.checkBranch(user, order.branchId);

      if (!order.account || order.account.waiterId !== user.id) {
        throw new ForbiddenException(
          'No eres el mesero responsable de esta comanda',
        );
      }

      if (order.status !== 'READY') {
        throw new ConflictException(
          'Solo se pueden entregar comandas listas',
        );
      }

      await tx.order.update({
        where: { id: orderId },
        data: { status: 'DELIVERED' },
      });

      return {
        id: order.id,
        status: 'Entregado',
      };
    });

    return result;
  }
}
