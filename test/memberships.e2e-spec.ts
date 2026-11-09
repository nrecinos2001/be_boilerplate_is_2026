// BE-1.1 (TSK-99) — Vitest. GET /api/v1/memberships/me
// Contrato del documento de historias (H1):
//   200 { id, planName, status: 'Vigente' | 'Vencida' | 'Sin membresía', endDate, remainingClasses }
//   'Sin membresía' => 200 con status 'Sin membresía' y el resto en null
//   401 sin token
// Esquema real (migración de Majano):
//   Plan:       id, name (unique), price, durationDays (Int)
//   Membership: id, userId, planId, startDate, endDate, status ('ACTIVE' | 'EXPIRED' | 'CANCELLED')
//   No existe ningún campo de clases (ni en Plan ni en Membership).
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/services/index.js';

const BASE = '/api/v1';
const PASSWORD = 'Demo1234!';
const DAY = 24 * 60 * 60 * 1000;

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
    await request(app.getHttpServer())
      .post(`${BASE}/users`)
      .send({ email, password: PASSWORD });
    const login = await request(app.getHttpServer())
      .post(`${BASE}/auth/login`)
      .send({ email, password: PASSWORD });
    const me = await request(app.getHttpServer())
      .get(`${BASE}/auth/me`)
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    return {
      token: login.body.accessToken as string,
      id: me.body.id as string,
    };
  }

  // --- helpers alineados con el esquema de Majano ---
  const makePlan = (tag: string) =>
    prisma.plan.create({
      data: {
        name: `${tag}-${stamp}`,
        price: 30,
        durationDays: 30,
      },
    });

  const makeMembership = (
    userId: string,
    planId: string,
    daysToEnd: number,
    status?: 'ACTIVE' | 'EXPIRED' | 'CANCELLED',
  ) =>
    prisma.membership.create({
      data: {
        userId,
        planId,
        startDate: new Date(Date.now() - 30 * DAY),
        endDate: new Date(Date.now() + daysToEnd * DAY),
        status: status ?? (daysToEnd < 0 ? 'EXPIRED' : 'ACTIVE'),
      },
    });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    // Replicar aquí lo que main.ts configure (prefijo, versionado, pipes, filtros).
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
    expect(res.body).toMatchObject({
      status: 'Sin membresía',
      planName: null,
      endDate: null,
      remainingClasses: null,
    });
  });

  it('Vigente: plan mensual con vencimiento a futuro', async () => {
    const u = await newUser('vig');
    const plan = await makePlan('Mensual-vig');
    await makeMembership(u.id, plan.id, 20);
    const res = await get(u.token).expect(200);
    expect(res.body.status).toBe('Vigente');
    expect(res.body.planName).toBe(plan.name);
    expect(res.body.endDate).toBeTruthy();
  });

  it('Vencida: plan mensual con fecha de vencimiento pasada', async () => {
    const u = await newUser('venc');
    const plan = await makePlan('Mensual-venc');
    await makeMembership(u.id, plan.id, -10);
    const res = await get(u.token).expect(200);
    expect(res.body.status).toBe('Vencida');
  });

  // Ni Plan ni Membership guardan clases (no hay classCount ni clases usadas).
  it.skip('Clases restantes', async () => {
    // TODO: requiere campos de clases en Plan/Membership. Definir con el equipo.
  });

  it('Usa la membresía más reciente si el miembro tiene varias', async () => {
    const u = await newUser('multi');
    const plan = await makePlan('Mensual-multi');
    await makeMembership(u.id, plan.id, -30);
    await new Promise((r) => setTimeout(r, 20));
    await makeMembership(u.id, plan.id, 15);
    const res = await get(u.token).expect(200);
    expect(res.body.status).toBe('Vigente');
  });

  it('403 al consultar la membresía de otro miembro', async () => {
    const owner = await newUser('dueno');
    const other = await newUser('otro');
    const plan = await makePlan('Mensual-otro');
    await makeMembership(owner.id, plan.id, 20);
    const res = await request(app.getHttpServer())
      .get(`${BASE}/memberships/${owner.id}/status`)
      .set('Authorization', `Bearer ${other.token}`)
      .expect(403);
    expect(JSON.stringify(res.body)).not.toContain(plan.name);
  });

  it('200 al consultar mi propia membresía por id', async () => {
    const u = await newUser('propio');
    const plan = await makePlan('Mensual-propio');
    await makeMembership(u.id, plan.id, 20);
    const res = await request(app.getHttpServer())
      .get(`${BASE}/memberships/${u.id}/status`)
      .set('Authorization', `Bearer ${u.token}`)
      .expect(200);
    expect(res.body.status).toBe('Vigente');
  });

  it('401 sin token en la ruta con id', async () => {
    await request(app.getHttpServer())
      .get(`${BASE}/memberships/00000000-0000-4000-8000-000000000000/status`)
      .expect(401);
  });

  afterAll(async () => {
    try {
      // Las membresías se borran en cascada al borrar el usuario; el plan es Restrict.
      await prisma.user.deleteMany({
        where: { email: { endsWith: `-${stamp}@test.com` } },
      });
      await prisma.plan.deleteMany({
        where: { name: { endsWith: `-${stamp}` } },
      });
    } catch {
      // limpieza best-effort
    }
    await app.close();
  });
});
