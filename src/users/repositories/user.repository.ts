import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { UsernameAlreadyTakenError } from '@Users/errors';
import { Prisma, type User } from '@PrismaClient';

/** Código de Prisma para violación de restricción única. */
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

export interface CreateUserData {
  username: string;
  passwordHash: string;
}

/**
 * Único punto del módulo que habla con la tabla `users`.
 *
 * Los servicios no conocen Prisma: reciben y devuelven entidades, y los
 * detalles del ORM (códigos de error, formas de `where`, `select`) quedan
 * encapsulados acá. Eso permite cambiar el acceso a datos sin tocar la lógica
 * de negocio, y testear los servicios con un doble de este repositorio.
 */
@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @throws {UsernameAlreadyTakenError} si el username ya existe.
   *
   * Se deja que la base decida la unicidad en vez de consultar antes: un
   * `findUnique` previo tiene una condición de carrera entre la lectura y el
   * insert. El código P2002 de Prisma se traduce a un error de dominio para
   * que la capa de servicio no tenga que conocer los códigos del ORM.
   */
  async create(data: CreateUserData): Promise<User> {
    try {
      return await this.prisma.user.create({ data });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_CONSTRAINT_VIOLATION
      ) {
        throw new UsernameAlreadyTakenError(data.username);
      }
      throw error;
    }
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { username } });
  }

  existsByUsername(username: string): Promise<boolean> {
    return this.prisma.user
      .count({ where: { username } })
      .then((count) => count > 0);
  }

  updatePasswordHash(id: string, passwordHash: string): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }

  setActive(id: string, isActive: boolean): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { isActive } });
  }

  deleteById(id: string): Promise<User> {
    return this.prisma.user.delete({ where: { id } });
  }
}
