import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/services/prisma.service.js';
import type { User } from '../generated/prisma/client.js';
import { NotificationSource } from '../generated/prisma/client.js';
import { CreateReservationDto } from './dto.js';
import { NotificationsService } from '../notifications/notifications.service.js';

@Injectable()
export class ReservationsService {
  constructor(
    private readonly db: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(user: User, dto: CreateReservationDto) {
    const reservationDate = new Date(dto.dateTime);

    if (Number.isNaN(reservationDate.getTime())) {
      throw new BadRequestException('La fecha no es válida');
    }

    if (reservationDate <= new Date()) {
      throw new BadRequestException(
        'No se pueden realizar reservas en fechas pasadas',
      );
    }

    if (!Number.isInteger(dto.peopleCount) || dto.peopleCount < 1) {
      throw new BadRequestException('La cantidad de personas no es válida');
    }

    const durationMinutes = 90;
    const reservationEnd = new Date(
      reservationDate.getTime() + durationMinutes * 60 * 1000,
    );

    const getLocalTime = (date: Date) =>
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/El_Salvador',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(date);

    const reservationTime = getLocalTime(reservationDate);
    const reservationEndTime = getLocalTime(reservationEnd);

    const result = await this.db.$transaction(async (tx) => {
      // Bloquear la sucursal para evitar reservas simultáneas.
      await tx.$queryRaw`
        SELECT id
        FROM branches
        WHERE id = ${dto.branchId}::uuid
        FOR UPDATE
      `;

      const branch = await tx.branch.findUnique({
        where: { id: dto.branchId },
      });

      if (!branch || !branch.isActive) {
        throw new NotFoundException(
          'La sucursal no existe o está inactiva',
        );
      }

      if (
        reservationTime < branch.openingTime ||
        reservationEndTime > branch.closingTime ||
        reservationEndTime <= reservationTime
      ) {
        throw new BadRequestException(
          'La reserva está fuera del horario de atención',
        );
      }

      // Buscar mesas con capacidad suficiente y sin cuentas abiertas.
      const availableTables = await tx.restaurantTable.findMany({
        where: {
          branchId: dto.branchId,
          capacity: {
            gte: dto.peopleCount,
          },
          status: 'FREE',
          accounts: {
            none: {
              status: 'OPEN',
            },
          },
        },
        orderBy: {
          capacity: 'asc',
        },
      });

      if (availableTables.length === 0) {
        throw new ConflictException(
          'No hay mesas disponibles con capacidad suficiente',
        );
      }

      // Consultar reservas confirmadas que podrían cruzarse.
      const existingReservations = await tx.reservation.findMany({
        where: {
          branchId: dto.branchId,
          status: 'CONFIRMED',
          dateTime: {
            gte: new Date(
              reservationDate.getTime() - 90 * 60 * 1000,
            ),
            lt: reservationEnd,
          },
        },
      });

      // Identificar mesas que ya tienen una reserva en ese intervalo.
      const occupiedTableIds = new Set(
        existingReservations
          .filter((reservation) => {
            const existingStart = reservation.dateTime;
            const existingEnd = new Date(
              existingStart.getTime() +
                reservation.durationMinutes * 60 * 1000,
            );

            return (
              existingStart < reservationEnd &&
              existingEnd > reservationDate
            );
          })
          .map((reservation) => reservation.tableId),
      );

      const selectedTable = availableTables.find(
        (table) => !occupiedTableIds.has(table.id),
      );

      if (!selectedTable) {
        throw new ConflictException(
          'No hay mesas disponibles para ese horario',
        );
      }

      // Crear la reserva.
      return tx.reservation.create({
        data: {
          userId: user.id,
          branchId: dto.branchId,
          tableId: selectedTable.id,
          dateTime: reservationDate,
          durationMinutes,
          peopleCount: dto.peopleCount,
          status: 'CONFIRMED',
        },
        include: {
          table: true,
          branch: true,
        },
      });
    });

    // Enviar notificación después de confirmar la reserva.
    await this.notifications.send({
      recipientIds: [user.id],
      title: 'Reserva confirmada',
      message: `Tu reserva ha sido confirmada para ${reservationDate.toLocaleString('es-SV', {
        timeZone: 'America/El_Salvador',
      })}. Mesa número ${result.table.number}.`,
      sourceModule: NotificationSource.RESERVAS,
      referenceType: 'Reservation',
      referenceId: result.id,
    });

    return {
      id: result.id,
      branchId: result.branchId,
      tableId: result.tableId,
      tableNumber: result.table.number,
      dateTime: result.dateTime,
      durationMinutes: result.durationMinutes,
      peopleCount: result.peopleCount,
      status: result.status,
    };
  }
}