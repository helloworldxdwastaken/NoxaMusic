import { useCallback, useEffect, useState } from 'react';
import TrackPlayer, {
  Event,
  State,
  Track,
  useTrackPlayerEvents,
} from 'react-native-track-player';

interface PlayerSnapshot {
  track: Track | null;
  state: State;
}

const DEFAULT_SNAPSHOT: PlayerSnapshot = {
  track: null,
  state: State.None,
};

const events = [Event.PlaybackTrackChanged, Event.PlaybackActiveTrackChanged, Event.PlaybackState];

export const useCurrentTrack = () => {
  const [snapshot, setSnapshot] = useState<PlayerSnapshot>(DEFAULT_SNAPSHOT);

  const hydrateTrack = useCallback(async () => {
    try {
      const [currentTrackId, playbackState] = await Promise.all([
        TrackPlayer.getCurrentTrack(),
        TrackPlayer.getState(),
      ]);

      if (currentTrackId == null) {
        setSnapshot({ track: null, state: playbackState });
        return;
      }

      const track = (await TrackPlayer.getTrack(currentTrackId)) ?? null;
      setSnapshot({ track, state: playbackState });
    } catch {
      setSnapshot(DEFAULT_SNAPSHOT);
    }
  }, []);

  useEffect(() => {
    hydrateTrack();
  }, [hydrateTrack]);

  useTrackPlayerEvents(events, async event => {
    if (event.type === Event.PlaybackTrackChanged) {
      const { nextTrack } = event;
      if (nextTrack == null) {
        setSnapshot(prev => ({ ...prev, track: null }));
        return;
      }
      const track = (await TrackPlayer.getTrack(nextTrack)) ?? null;
      setSnapshot(prev => ({ ...prev, track }));
      return;
    }

    if (event.type === Event.PlaybackActiveTrackChanged) {
      if (!event.track) {
        setSnapshot(prev => ({ ...prev, track: null }));
        return;
      }
      setSnapshot(prev => ({ ...prev, track: event.track ?? null }));
      return;
    }

    if (event.type === Event.PlaybackState) {
      setSnapshot(prev => ({ ...prev, state: event.state }));
    }
  });

  return snapshot;
};
