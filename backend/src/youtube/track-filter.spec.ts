import { describe, expect, it } from '@jest/globals';
import { ytVideo } from '../../test/utils/youtube-fixtures.js';
import { isPlayable, parseIsoDuration, splitArtistTitle, toFetchedTrack } from './track-filter.js';

describe('isPlayable', () => {
  it('accepts public and unlisted embeddable videos', () => {
    expect(isPlayable(ytVideo('a'))).toBe(true);
    expect(isPlayable(ytVideo('a', { status: { privacyStatus: 'unlisted' } }))).toBe(true);
  });

  it.each([
    ['private', { status: { privacyStatus: 'private' } }],
    ['not embeddable', { status: { embeddable: false } }],
    ['still processing', { status: { uploadStatus: 'uploaded' } }],
    ['age-restricted', { contentDetails: { contentRating: { ytRating: 'ytAgeRestricted' } } }],
    ['live', { live: 'live' }],
    ['upcoming', { live: 'upcoming' }],
    ['zero length', { contentDetails: { duration: 'P0D' } }],
  ] as const)('rejects a %s video', (_label, overrides) => {
    expect(isPlayable(ytVideo('a', overrides))).toBe(false);
  });

  it('applies region restrictions only when a region is configured', () => {
    const blocked = ytVideo('a', { contentDetails: { regionRestriction: { blocked: ['IN'] } } });
    const allowList = ytVideo('b', { contentDetails: { regionRestriction: { allowed: ['US'] } } });

    expect(isPlayable(blocked)).toBe(true);
    expect(isPlayable(blocked, 'IN')).toBe(false);
    expect(isPlayable(blocked, 'US')).toBe(true);
    expect(isPlayable(allowList, 'IN')).toBe(false);
    expect(isPlayable(allowList, 'US')).toBe(true);
  });
});

describe('parseIsoDuration', () => {
  it.each([
    ['PT3M21S', 201],
    ['PT1H2M3S', 3723],
    ['PT45S', 45],
    ['P1DT1S', 86_401],
    ['P0D', 0],
    ['garbage', 0],
    [undefined, 0],
  ])('parses %p as %d seconds', (input, seconds) => {
    expect(parseIsoDuration(input)).toBe(seconds);
  });
});

describe('splitArtistTitle', () => {
  it('splits "Artist - Title"', () => {
    expect(splitArtistTitle('Daft Punk - One More Time')).toEqual({
      artist: 'Daft Punk',
      title: 'One More Time',
    });
    expect(splitArtistTitle('A-ha – Take On Me (Official Video)')).toEqual({
      artist: 'A-ha',
      title: 'Take On Me (Official Video)',
    });
  });

  it('uses an auto-generated "Artist - Topic" channel', () => {
    expect(splitArtistTitle('Clair de Lune', 'Claude Debussy - Topic')).toEqual({
      artist: 'Claude Debussy',
      title: 'Clair de Lune',
    });
  });

  it('leaves the artist unknown otherwise', () => {
    expect(splitArtistTitle('Live at Wembley', 'Some Channel')).toEqual({
      artist: null,
      title: 'Live at Wembley',
    });
  });
});

describe('toFetchedTrack', () => {
  it('maps a video and truncates long titles', () => {
    const track = toFetchedTrack(ytVideo('abc', { title: `X - ${'y'.repeat(300)}` }));

    expect(track).toMatchObject({ videoId: 'abc', artist: 'X', durationSec: 210 });
    expect(track.title).toHaveLength(200);
    expect(track.thumbnailUrl).toBe('https://i.ytimg.com/vi/abc/hqdefault.jpg');
  });
});
