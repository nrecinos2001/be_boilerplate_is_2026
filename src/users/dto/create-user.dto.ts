import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({
    description: 'Nombre de usuario único. Solo letras, números, punto, guion y guion bajo.',
    example: 'nestor',
    minLength: 3,
    maxLength: 32,
  })
  @IsString()
  @MinLength(3, { message: 'El usuario debe tener al menos 3 caracteres.' })
  @MaxLength(32, { message: 'El usuario no puede superar los 32 caracteres.' })
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message: 'El usuario solo admite letras, números, punto, guion y guion bajo.',
  })
  username!: string;

  @ApiProperty({
    description: 'Contraseña. Debe incluir al menos una minúscula, una mayúscula y un número.',
    example: 'Str0ngPass!',
    minLength: 8,
    maxLength: 72,
  })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  // bcrypt trunca silenciosamente en 72 bytes, así que se rechaza antes de hashear.
  @MaxLength(72, { message: 'La contraseña no puede superar los 72 caracteres.' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message: 'La contraseña debe incluir al menos una minúscula, una mayúscula y un número.',
  })
  password!: string;
}
