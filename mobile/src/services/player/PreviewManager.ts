import TrackPlayer, { Event, State as TrackState, Track } from 'react-native-track-player';

import type { RemoteTrack } from '../../types/models';
import { setupPlayer } from './PlayerService';

type PlaybackSnapshot = {
  queue: Track[];
  currentTrackId?: string;
  position: number;
  wasPlaying: boolean;
};

type PreviewListener = (activeId: string | null) => void;

let snapshot: PlaybackSnapshot | null = null;
let previewActive = false;
let currentPreviewId: string | null = null;
let listenersRegistered = false;
const listeners = new Set<PreviewListener>();

const notify = (id: string | null) => {
  currentPreviewId = id;
  listeners.forEach(listener => {
    try {
      listener(id);
    } catch {
      // ignore listener errors
    }
  });
};

const ensureListeners = () => {
  if (listenersRegistered) {
    return;
  }
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async () => {
    if (previewActive) {
      await restoreSnapshot();
    }
  });
  listenersRegistered = true;
};

const captureSnapshot = async (): Promise<PlaybackSnapshot> => {
  const queue = await TrackPlayer.getQueue();
  const currentTrackIndex = await TrackPlayer.getCurrentTrack();
  let currentTrackId: string | undefined;
  if (currentTrackIndex != null) {
    const currentTrack = await TrackPlayer.getTrack(currentTrackIndex);
    if (currentTrack?.id != null) {
      currentTrackId = String(currentTrack.id);
    }
  }
  const position = await TrackPlayer.getPosition();
  const state = await TrackPlayer.getState();
  const wasPlaying = state === TrackState.Playing || state === TrackState.Buffering;
  return {
    queue,
    currentTrackId,
    position,
    wasPlaying,
  };
};

const restoreSnapshot = async () => {
  if (!snapshot) {
    previewActive = false;
    notify(null);
    return;
  }
  previewActive = false;
  const previous = snapshot;
  snapshot = null;
  await TrackPlayer.reset();
  if (previous.queue.length > 0) {
    await TrackPlayer.add(previous.queue);
    if (previous.currentTrackId) {
      const targetIndex = previous.queue.findIndex(
        track => `${track.id}` === previous.currentTrackId,
      );
      if (targetIndex >= 0) {
        try {
          await TrackPlayer.skip(targetIndex);
          if (previous.position > 0) {
            await TrackPlayer.seekTo(previous.position);
          }
        } catch {
          // ignore skip failures
        }
      }
    }
    if (previous.wasPlaying) {
      await TrackPlayer.play();
    }
  }
  notify(null);
};

export const cancelPreview = async () => {
  if (!previewActive) {
    return;
  }
  previewActive = false;
  snapshot = null;
  notify(null);
};

export const playPreview = async (remoteTrack: RemoteTrack) => {
  if (!remoteTrack.preview) {
    throw new Error('Preview not available for this track.');
  }
  await setupPlayer();
  ensureListeners();
  if (previewActive) {
    await restoreSnapshot();
  }
  snapshot = await captureSnapshot();
  previewActive = true;
  await TrackPlayer.reset();
  await TrackPlayer.add({
    id: `preview-${remoteTrack.id}`,
    url: remoteTrack.preview,
    title: remoteTrack.title,
    artist: remoteTrack.artistName,
    artwork: remoteTrack.image,
    duration: remoteTrack.duration ?? undefined,
  } as Track);
  notify(remoteTrack.id);
  await TrackPlayer.play();
};

export const subscribeToPreview = (listener: PreviewListener) => {
  listeners.add(listener);
  listener(currentPreviewId);
  return () => {
    listeners.delete(listener);
  };
};

export const isPreviewing = () => previewActive;
