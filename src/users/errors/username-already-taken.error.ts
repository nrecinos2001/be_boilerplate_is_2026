/**
 * Error de dominio: el username ya está ocupado.
 *
 * Lo lanza el repositorio al detectar la violación de unicidad, y la capa de
 * servicio lo traduce a una excepción HTTP. Así el repositorio no depende de
 * `@nestjs/common` ni sabe de códigos de estado, y el servicio no necesita
 * conocer los códigos de error de Prisma.
 */
export class UsernameAlreadyTakenError extends Error {
  constructor(public readonly username: string) {
    super(`El nombre de usuario "${username}" ya está en uso.`);
    this.name = 'UsernameAlreadyTakenError';
  }
}
