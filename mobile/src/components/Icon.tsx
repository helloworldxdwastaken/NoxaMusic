import React from 'react';
import Ionicons from 'react-native-vector-icons/Ionicons';

const ICON_MAP: Record<string, string> = {
  home: 'home',
  layers: 'layers',
  search: 'search',
  music: 'musical-notes',
  mic: 'mic',
  disc: 'disc',
  'hard-drive': 'hardware-chip',
  list: 'list',
  'plus-square': 'add-circle',
  'plus-circle': 'add-circle',
  plus: 'add',
  'minus-circle': 'remove-circle',
  'trash-2': 'trash',
  'alert-triangle': 'warning',
  x: 'close',
  'folder-plus': 'folder-open',
  check: 'checkmark',
  'check-circle': 'checkmark-circle',
  download: 'download',
  slash: 'ban',
  loader: 'refresh',
  move: 'move',
  'edit-3': 'create',
  settings: 'settings',
  'wifi-off': 'cloud-offline',
  'chevron-down': 'chevron-down',
  'chevron-left': 'chevron-back',
  'more-vertical': 'ellipsis-vertical',
  'skip-back': 'play-skip-back-sharp',
  'skip-forward': 'play-skip-forward-sharp',
  shuffle: 'shuffle',
  play: 'play-sharp',
  pause: 'pause-sharp',
  quote: 'text',
  lyrics: 'text',
};

type IoniconsProps = React.ComponentProps<typeof Ionicons>;

type Props = IoniconsProps & {
  name: string;
};

const Icon: React.FC<Props> = ({ name, ...rest }) => {
  const resolvedName = ICON_MAP[name] ?? name;
  return <Ionicons name={resolvedName} {...rest} />;
};

export default Icon;
