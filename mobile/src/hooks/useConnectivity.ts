import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

type ConnectivityState = {
  isConnected: boolean | null;
  isOffline: boolean;
};

const initialState: ConnectivityState = {
  isConnected: null,
  isOffline: false,
};

export const useConnectivity = () => {
  const [state, setState] = useState(initialState);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(info => {
      setState({
        isConnected: info.isConnected,
        isOffline: !(info.isConnected ?? true),
      });
    });
    NetInfo.fetch().then(info => {
      setState({
        isConnected: info.isConnected,
        isOffline: !(info.isConnected ?? true),
      });
    });
    return () => {
      unsubscribe();
    };
  }, []);

  return state;
};

