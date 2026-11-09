// BE-1.1 (TSK-99) — Vitest. GET /api/v1/memberships/me
// Contrato del documento de historias (H1):
//   200 { id, planName, status: 'Vigente' | 'Vencida' | 'Sin membresía', endDate, remainingClasses }
//   'Sin membresía' => 200 con status 'Sin membresía' y el resto en null
//   401 sin token
// OJO: los campos de prisma.plan / prisma.membership siguen el esquema del documento.
// Si en la migración de Majano se llaman distinto, ajusta solo los dos helpers de abajo.
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/services/index.js';

const BASE = '/api/v1';
const PASSWORD = 'Demo1234!';
const DAY = 864e5;

describe('GET /memberships/me', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();

  const get = (token?: string) => {
    const r = request(app.getHttpServer()).get(`${BASE}/memberships/me`);
    return token ? r.set('Authorization', `Bearer ${token}`) : r;
  };

  async function newUser(tag: string) {
    const email = `${tag}-${stamp}@test.com`;
    await request(app.getHttpServer()).post(`${BASE}/users`).send({ email, password: PASSWORD });
    const login = await request(app.getHttpServer()).post(`${BASE}/auth/login`).send({ email, password: PASSWORD });
    const me = await request(app.getHttpServer()).get(`${BASE}/auth/me`).set('Authorization', `Bearer ${login.body.accessToken}`);
    return { token: login.body.accessToken as string, id: me.body.id as string };
  }

  // --- helpers a ajustar si el esquema de Majano difiere ---
  const makePlan = (tag: string, type: 'MENSUAL' | 'CLASES_SUELTAS') =>
    prisma.plan.create({
      data: { name: `${tag}-${stamp}`, type, price: 30, durationDays: type === 'MENSUAL' ? 30 : null, classCount: type === 'CLASES_SUELTAS' ? 10 : null },
    });
  const makeMembership = (userId: string, planId: string, endOffsetDays: number | null, remainingClasses: number | null) =>
    prisma.membership.create({
      data: {
        userId, planId, startDate: new Date(Date.now() - 10 * DAY),
        endDate: endOffsetDays === null ? null : new Date(Date.now() + endOffsetDays * DAY),
        remainingClasses,
      },
    });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    prisma = app.get(PrismaService);
  });

  it('401 sin token', async () => {
    await get().expect(401);
  });

  it('Sin membresía: 200 con status "Sin membresía" y el resto en null', async () => {
    const u = await newUser('sin');
    const res = await get(u.token).expect(200);
    expect(res.body).toMatchObject({ status: 'Sin membresía', planName: null, endDate: null, remainingClasses: null });
  });

  it('Vigente: plan mensual con vencimiento a futuro', async () => {
    const u = await newUser('vig');
    const plan = await makePlan('Mensual-vig', 'MENSUAL');
    await makeMembership(u.id, plan.id, 20, null);
    const res = await get(u.token).expect(200);
    expect(res.body.status).toBe('Vigente');
    expect(res.body.planName).toBe(plan.name);
    expect(res.body.endDate).toBeTruthy();
  });

  it('Vencida: plan mensual con fecha de vencimiento pasada', async () => {
    const u = await newUser('venc');
    const plan = await makePlan('Mensual-venc', 'MENSUAL');
    await makeMembership(u.id, plan.id, -10, null);
    const res = await get(u.token).expect(200);
    expect(res.body.status).toBe('Vencida');
  });

  it('Plan por clases: Vigente con clases restantes, Vencida en 0', async () => {
    const a = await newUser('cla-a');
    const b = await newUser('cla-b');
    const plan = await makePlan('Clases', 'CLASES_SUELTAS');
    await makeMembership(a.id, plan.id, null, 3);
    await makeMembership(b.id, plan.id, null, 0);
    const resA = await get(a.token).expect(200);
    expect(resA.body).toMatchObject({ status: 'Vigente', remainingClasses: 3 });
    const resB = await get(b.token).expect(200);
    expect(resB.body.status).toBe('Vencida');
  });

  it('Usa la membresía más reciente si el miembro tiene varias', async () => {
    const u = await newUser('multi');
    const plan = await makePlan('Mensual-multi', 'MENSUAL');
    await makeMembership(u.id, plan.id, -30, null);
    await new Promise((r) => setTimeout(r, 20));
    await makeMembership(u.id, plan.id, 15, null);
    const res = await get(u.token).expect(200);
    expect(res.body.status).toBe('Vigente');
  });

  it('No permite consultar la membresía de otro miembro: no hay ruta con id', async () => {
    const owner = await newUser('dueno');
    const other = await newUser('otro');
    const plan = await makePlan('Mensual-otro', 'MENSUAL');
    await makeMembership(owner.id, plan.id, 20, null);
    const res = await request(app.getHttpServer())
      .get(`${BASE}/memberships/${owner.id}`)
      .set('Authorization', `Bearer ${other.token}`);
    expect([403, 404]).toContain(res.status);
    expect(JSON.stringify(res.body)).not.toContain(plan.name);
  });

  afterAll(() => app.close());
});
