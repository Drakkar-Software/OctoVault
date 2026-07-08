import { Platform, Switch as RNSwitch } from 'react-native';
import { Switch as NativeSwitch } from '@octovault/ui';

import { useTheme } from '@/lib/use-theme';

interface ToggleProps {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}

/**
 * Themed on/off switch. On native it renders the @expo/ui `Switch` (real SwiftUI
 * `Toggle` / Material switch), which inherits the marine accent from the native
 * Host seed — no inline track color. On web it keeps the react-native-web
 * `Switch` styled with the accent track, since the native control's web fallback
 * doesn't pick up the seed color the same way.
 */
export function Toggle({ value, onValueChange, disabled, accessibilityLabel }: ToggleProps) {
  const { colors } = useTheme();

  if (Platform.OS === 'web') {
    return (
      <RNSwitch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        accessibilityLabel={accessibilityLabel}
        trackColor={{ false: colors.fillDeep, true: colors.accent }}
        thumbColor={colors.paper}
        ios_backgroundColor={colors.fillDeep}
      />
    );
  }

  // The @expo/ui Switch takes no accessibilityLabel prop; the enclosing
  // ToggleRow renders the visible label that names the control.
  return <NativeSwitch value={value} onValueChange={onValueChange} disabled={disabled} />;
}
