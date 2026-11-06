import { Module } from '@nestjs/common';
import { RoomCodeGenerator } from './room-code.generator.js';
import { RoomsController } from './rooms.controller.js';
import { RoomsService } from './rooms.service.js';

@Module({
  controllers: [RoomsController],
  providers: [RoomsService, RoomCodeGenerator],
  exports: [RoomsService],
})
export class RoomsModule {}
