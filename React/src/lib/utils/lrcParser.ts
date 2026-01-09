export interface LyricLine {
  time: number | null;
  text: string;
}

/**
 * Parse LRC format lyrics to an array of timed lines
 * LRC format: [mm:ss.xx]Lyric text
 */
export function parseLRC(lrcText: string | null): LyricLine[] {
  if (!lrcText) return [];
  
  const lines: LyricLine[] = [];
  const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/g;
  let match;
  
  while ((match = regex.exec(lrcText)) !== null) {
    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const ms = parseInt(match[3].padEnd(3, '0'), 10);
    const time = minutes * 60 + seconds + ms / 1000;
    const text = match[4].trim();
    
    if (text) {
      lines.push({ time, text });
    }
  }
  
  return lines.sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
}

/**
 * Parse plain lyrics (no timestamps)
 */
export function parsePlainLyrics(text: string | null): LyricLine[] {
  if (!text) return [];
  
  return text
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => ({
      time: null,
      text: line.trim(),
    }));
}

/**
 * Find the current lyric line index based on playback time
 */
export function findCurrentLineIndex(
  lyrics: LyricLine[],
  currentTime: number
): number {
  if (!lyrics.length) return -1;
  
  // Find the last line that started before current time
  for (let i = lyrics.length - 1; i >= 0; i--) {
    if (lyrics[i].time !== null && lyrics[i].time! <= currentTime) {
      return i;
    }
  }
  
  return -1;
}

/**
 * Check if lyrics are synced (have timestamps)
 */
export function isSyncedLyrics(lyrics: LyricLine[]): boolean {
  return lyrics.some((line) => line.time !== null);
}

