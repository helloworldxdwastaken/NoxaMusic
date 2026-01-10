declare module '@react-native-community/blur' {
  import type { Component } from 'react';
  import type { NativeSyntheticEvent, ViewStyle } from 'react-native';

  type BlurType =
    | 'xlight'
    | 'light'
    | 'dark'
    | 'extraDark'
    | 'regular'
    | 'prominent'
    | 'thinMaterial'
    | 'thickMaterial'
    | 'chromeMaterial'
    | 'material';

  export interface BlurViewProps {
    blurType?: BlurType;
    blurAmount?: number;
    reducedTransparencyFallbackColor?: string;
    style?: ViewStyle | ViewStyle[];
    overlayColor?: string;
    onAnimationEnd?: (event: NativeSyntheticEvent<Record<string, unknown>>) => void;
  }

  export class BlurView extends Component<BlurViewProps> {}
}
