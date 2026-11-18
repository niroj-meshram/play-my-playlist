import { describe, expect, it } from '@jest/globals';
import { ErrorCode } from '@pmp/shared';
import { parsePlaylistId } from './playlist-url.parser.js';

const ID = 'PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG';

describe('parsePlaylistId', () => {
  it.each([
    `https://www.youtube.com/playlist?list=${ID}`,
    `https://youtube.com/playlist?list=${ID}&si=abc`,
    `http://m.youtube.com/playlist?list=${ID}`,
    `https://music.youtube.com/playlist?list=${ID}`,
    `https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=${ID}&index=3`,
    `https://youtu.be/dQw4w9WgXcQ?list=${ID}`,
    `youtube.com/playlist?list=${ID}`,
    `  ${ID}  `,
    'OLAK5uy_kq1x2Yk3fBqWbXZ0mF6cVYhq9Yt8Lp3sA',
  ])('extracts the playlist ID from %s', (input) => {
    expect(parsePlaylistId(input)).toBe(input.includes('OLAK') ? input : ID);
  });

  it('accepts YouTube Music curated playlists even though they start with RD', () => {
    const curated = 'RDCLAK5uy_nmS3YoxSwVVQk9lEQJ0UX4ZCjXsW_psU8';
    expect(parsePlaylistId(`https://music.youtube.com/playlist?list=${curated}`)).toBe(curated);
  });

  it.each([
    ['https://www.youtube.com/playlist?list=LL', /Liked videos/],
    ['https://music.youtube.com/playlist?list=LM', /Liked videos/],
    ['https://www.youtube.com/playlist?list=WL', /Watch Later/],
    ['https://www.youtube.com/watch?v=abc&list=RDabc123xyz', /Mixes/],
    ['https://music.youtube.com/watch?v=abc&list=RDAMVMabc123xyz', /Mixes/],
    ['https://www.youtube.com/playlist?list=RDCLAK', /Mixes/],
  ])('rejects the personal or generated list %s', (input, message) => {
    expect(() => parsePlaylistId(input)).toThrow(
      expect.objectContaining({
        code: ErrorCode.UNSUPPORTED_PLAYLIST,
        message: expect.stringMatching(message),
      }),
    );
  });

  it.each([
    '',
    'not a url at all',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    `https://evil.example.com/playlist?list=${ID}`,
    `https://youtube.com.evil.example/playlist?list=${ID}`,
    'https://www.youtube.com/playlist?list=<script>',
  ])('rejects %p as an invalid playlist URL', (input) => {
    expect(() => parsePlaylistId(input)).toThrow(
      expect.objectContaining({ code: ErrorCode.INVALID_PLAYLIST_URL }),
    );
  });
});
