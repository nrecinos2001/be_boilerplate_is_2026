// src/membership/services/membership.service.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MembershipService } from './membership.service.js';
import type { MembershipRepository } from '../repositories/membership.repository.js';

const DAY = 24 * 60 * 60 * 1000;

const makeRecord = (daysToEnd: number, status = 'ACTIVE') => ({
  id: 'm-1',
  userId: 'u-1',
  planId: 'p-1',
  startDate: new Date(Date.now() - 30 * DAY),
  endDate: new Date(Date.now() + daysToEnd * DAY),
  status,
  createdAt: new Date(),
  updatedAt: new Date(),
  plan: { id: 'p-1', name: 'Mensual', price: 30, durationDays: 30 },
});

describe('MembershipService.checkMembershipStatus', () => {
  let findByUserId: ReturnType<typeof vi.fn>;
  let service: MembershipService;

  beforeEach(() => {
    findByUserId = vi.fn();
    service = new MembershipService({
      findByUserId,
    } as unknown as MembershipRepository);
  });

  it('devuelve "Sin membresía" con el resto en null cuando no hay registro', async () => {
    findByUserId.mockResolvedValue(null);

    await expect(service.checkMembershipStatus('u-1')).resolves.toEqual({
      id: null,
      planName: null,
      status: 'Sin membresía',
      endDate: null,
      remainingClasses: null,
    });
    expect(findByUserId).toHaveBeenCalledWith('u-1');
  });

  it('devuelve "Vigente" si la fecha de vencimiento es futura', async () => {
    const record = makeRecord(20);
    findByUserId.mockResolvedValue(record);

    const res = await service.checkMembershipStatus('u-1');

    expect(res.status).toBe('Vigente');
    expect(res.id).toBe('m-1');
    expect(res.planName).toBe('Mensual');
    expect(res.endDate).toEqual(record.endDate);
    expect(res.remainingClasses).toBeNull();
  });

  it('devuelve "Vencida" si la fecha de vencimiento ya pasó', async () => {
    findByUserId.mockResolvedValue(makeRecord(-10, 'EXPIRED'));

    const res = await service.checkMembershipStatus('u-1');

    expect(res.status).toBe('Vencida');
  });

  it('trata una membresía CANCELLED como "Vencida" aunque no haya vencido', async () => {
    findByUserId.mockResolvedValue(makeRecord(20, 'CANCELLED'));

    const res = await service.checkMembershipStatus('u-1');

    expect(res.status).toBe('Vencida');
  });

  it('propaga el error si el repository falla', async () => {
    findByUserId.mockRejectedValue(new Error('db down'));

    await expect(service.checkMembershipStatus('u-1')).rejects.toThrow(
      'db down',
    );
  });
});
