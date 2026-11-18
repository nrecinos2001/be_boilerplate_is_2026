import { IsInt, IsISO8601, IsUUID, Min } from 'class-validator';

export class CreateReservationDto {
  @IsUUID()
  branchId!: string;

  @IsISO8601()
  dateTime!: string;

  @IsInt()
  @Min(1)
  peopleCount!: number;
}