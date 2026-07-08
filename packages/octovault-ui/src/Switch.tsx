'use client';
import { Platform } from 'react-native';
import { Switch as ExpoSwitch } from '@expo/ui';
import type { SwitchProps } from '@expo/ui';

import { labelsHidden } from './_host/modifiers';
import { useHostWrap } from './_host/Host';

/**
 * Native on/off switch — @expo/ui `Switch` (SwiftUI `Toggle` on iOS, Material on
 * Android, RNW fallback on web). Inherits the accent tint from the Host seed, so
 * no explicit track color is passed.
 *
 * `matchContents` hugs both axes to the control's intrinsic size (a Host defaults
 * to non-hugging sizing, which would stretch the switch across a trailing row).
 * `alignSelf: center` vertically centers it in the row. On iOS, `labelsHidden()`
 * drops the SwiftUI Toggle's empty label line-box so the measured box hugs the
 * switch itself and centers cleanly — the label box otherwise top-aligns it.
 */
export function Switch({ modifiers, ...props }: SwitchProps) {
  const merged = Platform.OS === 'ios' ? [...(modifiers ?? []), labelsHidden()] : modifiers;
  return useHostWrap(<ExpoSwitch {...props} modifiers={merged} />, {
    matchContents: true,
    style: { alignSelf: 'center' },
  });
}

Switch.displayName = 'OctoSwitch';

export type { SwitchProps };
