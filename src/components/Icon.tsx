import { type ColorValue, type StyleProp, Text, type TextStyle } from 'react-native';

import glyphmap from '@/assets/fonts/glyphmap.json';

export type IconName = keyof typeof glyphmap;

type Props = {
  name: IconName;
  size?: number;
  color: ColorValue;
  filled?: boolean;
  style?: StyleProp<TextStyle>;
};

export function Icon({ name, size = 22, color, filled = false, style }: Props) {
  return (
    <Text
      style={[
        {
          fontFamily: filled ? 'MaterialSymbolsFill' : 'MaterialSymbolsOutline',
          fontSize: size,
          lineHeight: size,
          color,
        },
        style,
      ]}
      aria-hidden>
      {String.fromCodePoint(glyphmap[name])}
    </Text>
  );
}
