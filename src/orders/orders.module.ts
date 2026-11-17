import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import { NotificationsModule } from '../notifications/notifications.module.js';

import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { TakeawayController } from './takeaway.controller.js';
import { TakeawayService } from './takeaway.service.js';
import { KitchenGateway } from './kitchen.gateway.js';
import { KitchenController } from './kitchen.controller.js';
import { KitchenReadyController } from './kitchen-ready.controller.js';
import { KitchenDeliveryController } from './kitchen-delivery.controller.js';
import { KitchenService } from './kitchen.service.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
    NotificationsModule,
  ],
  controllers: [
    OrdersController,
    TakeawayController,
    KitchenController,
    KitchenReadyController,
    KitchenDeliveryController,
  ],
  providers: [
    OrdersService,
    TakeawayService,
    KitchenGateway,
    KitchenService,
  ],
})
export class OrdersModule {}
