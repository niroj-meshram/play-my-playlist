import { Module } from '@nestjs/common';
import { RealtimeCoreModule } from '../realtime/realtime-core.module.js';
import { HostMigrationService } from './host-migration.service.js';
import { RoomCodeGenerator } from './room-code.generator.js';
import { RoomsController } from './rooms.controller.js';
import { RoomsService } from './rooms.service.js';

@Module({
  imports: [RealtimeCoreModule],
  controllers: [RoomsController],
  providers: [RoomsService, HostMigrationService, RoomCodeGenerator],
  exports: [RoomsService, HostMigrationService],
})
export class RoomsModule {}
