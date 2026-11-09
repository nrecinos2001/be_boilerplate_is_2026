import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '@Auth';
import { JwtAuthGuard } from '@Auth/guards';
import { HealthModule } from '@Health';
import { PrismaModule } from '@Prisma';
import { UsersModule } from '@Users';
import { validateEnv } from '@Config';
import { MembershipModule } from './membership/membership.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Si falta DATABASE_URL o JWT_SECRET, la app no arranca.
      validate: validateEnv,
    }),
    PrismaModule,
    HealthModule,
    UsersModule,
    AuthModule,
    MembershipModule, // <--- Aquí va correctamente en el array principal de imports del módulo
  ],
  controllers: [],
  providers: [
    {
      // Todo cerrado por defecto: Las rutas públicas se abren con @Public().
      provide: APP_GUARD,
      useExisting: JwtAuthGuard,
    },
  ],
})
export class AppModule {}