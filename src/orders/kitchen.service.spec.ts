import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

import { UserRole } from '../generated/prisma/client.js';
import { KitchenService } from './kitchen.service.js';

describe('KitchenService - H8', () => {
  const user = {
    id: 'user-1',
    role: UserRole.COCINA,
  } as any;

  const orderId = '11111111-1111-4111-8111-111111111111';
  const itemId = '22222222-2222-4222-8222-222222222222';
  const branchId = '33333333-3333-4333-8333-333333333333';

  let service: KitchenService;
  let tx: any;
  let db: any;
  let kitchen: any;
  let notifications: any;

  beforeEach(() => {
    tx = {
      $queryRaw: vi.fn(),
      order: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      orderItem: {
        update: vi.fn(),
      },
    };

    db = {
      $transaction: vi.fn(async (callback) => callback(tx)),
      staffBranch: {
        findUnique: vi.fn().mockResolvedValue({
          userId: user.id,
          branchId,
        }),
        findMany: vi.fn(),
      },
      order: {
        findMany: vi.fn(),
      },
    };

    kitchen = {
      orderUpdated: vi.fn(),
    };

    notifications = {
      send: vi.fn().mockResolvedValue([]),
    };

    service = new KitchenService(db, kitchen, notifications);
  });

  it('marca un platillo en preparación como listo', async () => {
    tx.order.findUnique.mockResolvedValue({
      id: orderId,
      branchId,
      status: 'IN_PREPARATION',
      items: [{ id: itemId, status: 'IN_PREPARATION' }],
    });

    tx.orderItem.update.mockResolvedValue({
      id: itemId,
      status: 'READY',
    });

    const result = await service.markItemReady(
      user,
      orderId,
      itemId,
      'Listo',
    );

    expect(tx.orderItem.update).toHaveBeenCalledWith({
      where: { id: itemId },
      data: { status: 'READY' },
    });

    expect(result).toEqual({
      id: itemId,
      orderId,
      status: 'Listo',
    });

    expect(kitchen.orderUpdated).toHaveBeenCalled();
  });

  it('rechaza marcar un platillo si la comanda no está en preparación', async () => {
    tx.order.findUnique.mockResolvedValue({
      id: orderId,
      branchId,
      status: 'RECEIVED',
      items: [{ id: itemId, status: 'IN_PREPARATION' }],
    });

    await expect(
      service.markItemReady(user, orderId, itemId, 'Listo'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.orderItem.update).not.toHaveBeenCalled();
  });

  it('rechaza la operación si el usuario no pertenece a la sucursal', async () => {
    db.staffBranch.findUnique.mockResolvedValue(null);

    tx.order.findUnique.mockResolvedValue({
      id: orderId,
      branchId,
      status: 'IN_PREPARATION',
      items: [{ id: itemId, status: 'IN_PREPARATION' }],
    });

    await expect(
      service.markItemReady(user, orderId, itemId, 'Listo'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(tx.orderItem.update).not.toHaveBeenCalled();
  });

  it('marca la comanda lista cuando todos sus platillos están listos', async () => {
    tx.order.findUnique.mockResolvedValue({
      id: orderId,
      branchId,
      status: 'IN_PREPARATION',
      items: [{ id: itemId, status: 'READY' }],
      account: { waiterId: 'waiter-1' },
    });

    tx.order.update.mockResolvedValue({});

    const result = await service.markOrderReady(
      user,
      orderId,
      'Listo',
    );

    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: orderId },
      data: { status: 'READY' },
    });

    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientIds: ['waiter-1'],
        sourceModule: 'COCINA',
        referenceType: 'Order',
        referenceId: orderId,
      }),
    );

    expect(result).toEqual({
      id: orderId,
      status: 'Listo',
    });
  });

  it('rechaza marcar lista una comanda con platillos pendientes', async () => {
    tx.order.findUnique.mockResolvedValue({
      id: orderId,
      branchId,
      status: 'IN_PREPARATION',
      items: [
        { id: itemId, status: 'READY' },
        { id: 'item-2', status: 'IN_PREPARATION' },
      ],
      account: { waiterId: 'waiter-1' },
    });

    await expect(
      service.markOrderReady(user, orderId, 'Listo'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.order.update).not.toHaveBeenCalled();
    expect(notifications.send).not.toHaveBeenCalled();
  });

  it('rechaza marcar lista una comanda sin mesero responsable', async () => {
    tx.order.findUnique.mockResolvedValue({
      id: orderId,
      branchId,
      status: 'IN_PREPARATION',
      items: [{ id: itemId, status: 'READY' }],
      account: null,
    });

    await expect(
      service.markOrderReady(user, orderId, 'Listo'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.order.update).not.toHaveBeenCalled();
  });

  it('permite al mesero consultar sus comandas listas', async () => {
    const waiter = {
      id: 'waiter-1',
      role: UserRole.MESERO,
    } as any;

    db.staffBranch.findMany.mockResolvedValue([
      { branchId },
    ]);

    db.order.findMany.mockResolvedValue([
      { id: orderId, status: 'READY' },
    ]);

    const result = await service.readyForDelivery(waiter);

    expect(db.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          branchId,
          status: 'READY',
          account: { waiterId: waiter.id },
        },
      }),
    );

    expect(result).toHaveLength(1);
  });

  it('rechaza entregar una comanda que no está lista', async () => {
    const waiter = {
      id: 'waiter-1',
      role: UserRole.MESERO,
    } as any;

    tx.order.findUnique.mockResolvedValue({
      id: orderId,
      branchId,
      status: 'IN_PREPARATION',
      account: { waiterId: waiter.id },
    });

    await expect(
      service.markDelivered(waiter, orderId),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.order.update).not.toHaveBeenCalled();
  });

  it('rechaza la entrega si el mesero no es responsable', async () => {
    const waiter = {
      id: 'waiter-2',
      role: UserRole.MESERO,
    } as any;

    tx.order.findUnique.mockResolvedValue({
      id: orderId,
      branchId,
      status: 'READY',
      account: { waiterId: 'waiter-1' },
    });

    await expect(
      service.markDelivered(waiter, orderId),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(tx.order.update).not.toHaveBeenCalled();
  });

  it('marca como entregada una comanda lista', async () => {
    const waiter = {
      id: 'waiter-1',
      role: UserRole.MESERO,
    } as any;

    tx.order.findUnique.mockResolvedValue({
      id: orderId,
      branchId,
      status: 'READY',
      account: { waiterId: waiter.id },
    });

    tx.order.update.mockResolvedValue({});

    const result = await service.markDelivered(waiter, orderId);

    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: orderId },
      data: { status: 'DELIVERED' },
    });

    expect(result).toEqual({
      id: orderId,
      status: 'Entregado',
    });
  });

  it('consulta las comandas en preparación de las sucursales asignadas', async () => {
    const orders = [
      {
        id: orderId,
        status: 'IN_PREPARATION',
      },
    ];

    db.staffBranch.findMany.mockResolvedValue([
      { branchId },
    ]);

    db.order.findMany.mockResolvedValue(orders);

    const result = await service.getOrdersInPreparation(user);

    expect(db.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          branchId: { in: [branchId] },
          status: 'IN_PREPARATION',
        },
      }),
    );

    expect(result).toEqual(orders);
  });

  it('rechaza consultar comandas si el usuario no es de cocina', async () => {
    const waiter = {
      id: 'waiter-1',
      role: UserRole.MESERO,
    } as any;

    await expect(
      service.getOrdersInPreparation(waiter),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(db.staffBranch.findMany).not.toHaveBeenCalled();
    expect(db.order.findMany).not.toHaveBeenCalled();
  });

  it('devuelve una lista vacía si cocina no tiene sucursales asignadas', async () => {
    db.staffBranch.findMany.mockResolvedValue([]);

    const result = await service.getOrdersInPreparation(user);

    expect(result).toEqual([]);
    expect(db.order.findMany).not.toHaveBeenCalled();
  });
});
