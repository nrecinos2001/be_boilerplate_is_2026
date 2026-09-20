import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'demo' })
  @IsString()
  @IsNotEmpty({ message: 'El usuario es obligatorio.' })
  @MaxLength(32)
  username!: string;

  // A diferencia del registro, acá NO se valida la forma de la contraseña:
  // las reglas de complejidad pueden cambiar con el tiempo y un usuario viejo
  // debe poder seguir entrando. Solo se acota el largo.
  @ApiProperty({ example: 'Demo1234!' })
  @IsString()
  @IsNotEmpty({ message: 'La contraseña es obligatoria.' })
  @MaxLength(72)
  password!: string;
}
