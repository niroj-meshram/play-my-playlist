import { Module } from '@nestjs/common';
import { RealtimeCoreModule } from '../realtime/realtime-core.module.js';
import { YoutubeModule } from '../youtube/youtube.module.js';
import { PlaylistEventsService } from './playlist-events.service.js';
import { PlaylistIngestionService } from './playlist-ingestion.service.js';
import { PlaylistJobRunner } from './playlist-job-runner.service.js';
import { PlaylistRecoveryService } from './playlist-recovery.service.js';
import { PlaylistsController } from './playlists.controller.js';
import { PlaylistsService } from './playlists.service.js';

@Module({
  imports: [YoutubeModule, RealtimeCoreModule],
  controllers: [PlaylistsController],
  providers: [
    PlaylistsService,
    PlaylistEventsService,
    PlaylistIngestionService,
    PlaylistJobRunner,
    PlaylistRecoveryService,
  ],
})
export class PlaylistsModule {}
