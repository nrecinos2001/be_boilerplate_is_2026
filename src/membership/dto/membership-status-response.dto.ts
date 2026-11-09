// src/membership/dto/membership-status-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export type MembershipStatus = 'Vigente' | 'Vencida' | 'Sin membresía';

export class MembershipStatusResponseDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Id de la membresía; null si no tiene',
  })
  id!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Nombre del plan; null si no tiene',
  })
  planName!: string | null;

  @ApiProperty({ enum: ['Vigente', 'Vencida', 'Sin membresía'] })
  status!: MembershipStatus;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Fecha de vencimiento',
  })
  endDate!: Date | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Clases restantes. Hoy siempre null: el modelo Membership no guarda consumo de clases.',
  })
  remainingClasses!: number | null;
}
