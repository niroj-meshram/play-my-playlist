import type { FetchedTrack, YtVideo } from './youtube.types.js';

const MAX_TEXT = 200;
const MAX_URL = 512;

/**
 * Whether a video can be embedded and played by the leader's IFrame player. Anything
 * private, unprocessed, non-embeddable, age-restricted, live or region-blocked is dropped.
 */
export function isPlayable(video: YtVideo, regionCode?: string): boolean {
  const { status, contentDetails, snippet } = video;
  if (status.privacyStatus !== 'public' && status.privacyStatus !== 'unlisted') return false;
  if (status.uploadStatus !== 'processed') return false;
  if (status.embeddable !== true) return false;
  if (contentDetails.contentRating?.ytRating === 'ytAgeRestricted') return false;
  if (snippet.liveBroadcastContent && snippet.liveBroadcastContent !== 'none') return false;
  if (parseIsoDuration(contentDetails.duration) <= 0) return false;
  return regionCode ? isAllowedIn(video, regionCode) : true;
}

function isAllowedIn(video: YtVideo, regionCode: string): boolean {
  const restriction = video.contentDetails.regionRestriction;
  if (!restriction) return true;
  if (restriction.allowed) return restriction.allowed.includes(regionCode);
  return !restriction.blocked?.includes(regionCode);
}

/** Parses ISO-8601 durations such as `PT3M21S` or `P1DT2H`. Returns 0 when unparseable. */
export function parseIsoDuration(value: string | undefined): number {
  const match = value?.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!match) return 0;
  const [, d = '0', h = '0', m = '0', s = '0'] = match;
  return Number(d) * 86_400 + Number(h) * 3_600 + Number(m) * 60 + Number(s);
}

/**
 * Best-effort artist and title. "Artist - Title" uploads are split; otherwise auto-generated
 * "Artist - Topic" channels give the artist. The Data API has no artist field.
 */
export function splitArtistTitle(
  rawTitle: string,
  channelTitle?: string,
): { artist: string | null; title: string } {
  const separator = rawTitle.match(/\s+[-–—]\s+/);
  if (separator?.index !== undefined && separator.index > 0) {
    const artist = rawTitle.slice(0, separator.index).trim();
    const title = rawTitle.slice(separator.index + separator[0].length).trim();
    if (artist && title) return { artist, title };
  }
  const topic = channelTitle?.match(/^(.+?)\s+-\s+Topic$/);
  return { artist: topic?.[1]?.trim() ?? null, title: rawTitle.trim() };
}

const THUMBNAIL_PREFERENCE = ['high', 'medium', 'standard', 'default', 'maxres'];

export function toFetchedTrack(video: YtVideo): FetchedTrack {
  const { artist, title } = splitArtistTitle(video.snippet.title, video.snippet.channelTitle);
  const thumbnails = video.snippet.thumbnails ?? {};
  const thumbnail = THUMBNAIL_PREFERENCE.map((k) => thumbnails[k]?.url).find(Boolean) ?? null;
  return {
    videoId: video.id,
    title: truncate(title, MAX_TEXT),
    artist: artist ? truncate(artist, MAX_TEXT) : null,
    thumbnailUrl: thumbnail && thumbnail.length <= MAX_URL ? thumbnail : null,
    durationSec: parseIsoDuration(video.contentDetails.duration),
  };
}

export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
