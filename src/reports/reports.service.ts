import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/services/prisma.service.js';
import { PeakHoursQueryDto, SalesQueryDto } from './dto.js';
import { armarBloques } from './peak-hours.js';
import { OFFSET_HORAS, validarPeriodo } from './period.js';

// Montos en dólares con 2 decimales (Épica 10).
const dinero = (valor: Prisma.Decimal) => valor.toDecimalPlaces(2).toNumber();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // Sucursales para los filtros de H27 a H29, ordenadas por nombre.
  async branches() {
    const data = await this.prisma.branch.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    return { data };
  }

  // H27: ventas totales por sucursal en el período. Una venta es un
  // comprobante (solo existe cuando el pago está aprobado, H18 y H19);
  // el período se filtra por la fecha de emisión del comprobante.
  async sales(query: SalesQueryDto) {
    const periodo = validarPeriodo(query.from, query.to);

    if (query.branchId !== undefined) {
      const existe =
        UUID.test(query.branchId) &&
        (await this.prisma.branch.findUnique({
          where: { id: query.branchId },
          select: { id: true },
        }));
      if (!existe) throw new NotFoundException('La sucursal no existe.');
    }

    const grupos = await this.prisma.receipt.groupBy({
      by: ['branchId'],
      where: {
        issuedAt: { gte: periodo.desde, lt: periodo.hasta },
        ...(query.branchId ? { branchId: query.branchId } : {}),
      },
      _sum: { subtotal: true, discount: true, tax: true, total: true },
      _count: { _all: true },
    });

    const nombres = new Map(
      (
        await this.prisma.branch.findMany({
          where: { id: { in: grupos.map((g) => g.branchId) } },
          select: { id: true, name: true },
        })
      ).map((b) => [b.id, b.name]),
    );

    const cero = new Prisma.Decimal(0);
    const branches = grupos
      .map((g) => ({
        branchId: g.branchId,
        branchName: nombres.get(g.branchId) ?? '',
        receiptCount: g._count._all,
        // Subtotal sin IVA = suma de subtotal menos suma de descuentos.
        subtotal: dinero((g._sum.subtotal ?? cero).minus(g._sum.discount ?? cero)),
        tax: dinero(g._sum.tax ?? cero),
        totalSales: dinero(g._sum.total ?? cero),
      }))
      .sort(
        (a, b) =>
          b.totalSales - a.totalSales ||
          a.branchName.localeCompare(b.branchName, 'es'),
      );

    return {
      from: periodo.from,
      to: periodo.to,
      totalSales: dinero(
        grupos.reduce((suma, g) => suma.plus(g._sum.total ?? cero), cero),
      ),
      receiptCount: branches.reduce((suma, b) => suma + b.receiptCount, 0),
      branches,
    };
  }

  // H29: pedidos por hora de la sucursal en el período.
  async peakHours(query: PeakHoursQueryDto) {
    if (!query.branchId) {
      throw new BadRequestException({
        message: 'Seleccione una sucursal.',
        field: 'branchId',
      });
    }
    const periodo = validarPeriodo(query.from, query.to);

    const branch = UUID.test(query.branchId)
      ? await this.prisma.branch.findUnique({
          where: { id: query.branchId },
          select: { id: true, name: true, openingTime: true, closingTime: true },
        })
      : null;
    if (!branch) throw new NotFoundException('La sucursal no existe.');

    // Hora de creación convertida a UTC-6; se excluyen Cancelado y
    // Pendiente Pago (pedidos para llevar que nunca se pagaron, H5).
    const filas = await this.prisma.$queryRaw<{ hour: number; count: number }[]>(
      Prisma.sql`
        SELECT EXTRACT(HOUR FROM o.created_at - make_interval(hours => ${OFFSET_HORAS}))::int AS hour,
               COUNT(*)::int AS count
        FROM orders o
        WHERE o.branch_id = ${branch.id}::uuid
          AND o.status::text NOT IN ('CANCELLED', 'PENDING_PAYMENT')
          AND o.created_at >= ${periodo.desde}
          AND o.created_at < ${periodo.hasta}
        GROUP BY 1`,
    );

    const conteos = new Map(filas.map((f) => [f.hour, f.count]));
    const totalOrders = filas.reduce((suma, f) => suma + f.count, 0);

    return {
      branchId: branch.id,
      branchName: branch.name,
      from: periodo.from,
      to: periodo.to,
      totalOrders,
      hours: armarBloques(branch.openingTime, branch.closingTime, conteos),
    };
  }
}
