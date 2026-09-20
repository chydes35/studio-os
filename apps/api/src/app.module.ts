import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AvailabilityModule } from './availability/availability.module.js';
import { BookingsModule } from './bookings/bookings.module.js';
import { ClientsModule } from './clients/clients.module.js';
import { ContractsModule } from './contracts/contracts.module.js';
import { DbModule } from './db/db.module.js';
import { GalleryModule } from './gallery/gallery.module.js';
import { MediaModule } from './media/media.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { OwnerModule } from './owner/owner.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { QuestionnairesModule } from './questionnaires/questionnaires.module.js';
import { StorageModule } from './storage/storage.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    DbModule,
    StorageModule,
    OwnerModule,
    ClientsModule,
    AvailabilityModule,
    BookingsModule,
    GalleryModule,
    MediaModule,
    ContractsModule,
    PaymentsModule,
    QuestionnairesModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
