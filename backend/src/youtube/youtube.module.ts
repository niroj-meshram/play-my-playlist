import { Module } from '@nestjs/common';
import { PlaylistCacheService } from './playlist-cache.service.js';
import { PlaylistFetcherService } from './playlist-fetcher.service.js';
import { QuotaService } from './quota.service.js';
import { YoutubeApiClient } from './youtube-api.client.js';
import { YoutubeClient } from './youtube.types.js';

@Module({
  providers: [
    QuotaService,
    PlaylistCacheService,
    PlaylistFetcherService,
    { provide: YoutubeClient, useClass: YoutubeApiClient },
  ],
  exports: [PlaylistFetcherService, QuotaService],
})
export class YoutubeModule {}
