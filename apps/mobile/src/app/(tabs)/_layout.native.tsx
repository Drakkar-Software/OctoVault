import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { fonts } from '@/theme';
import { useResponsive } from '@/lib/use-responsive';
import { useTheme } from '@/lib/use-theme';
import { useBrand } from '@/lib/brand-context';
import type { Capability } from '@drakkar.software/octovault-sdk';

/**
 * Native (iOS / Android) bottom tabs. Renders the real platform tab bar via Expo
 * Router's `NativeTabs`. Four tabs: Vault (workspace), Agents (active space automations),
 * Notes (personal magic space), and Search (iOS 26 floats it to bottom-right).
 * The web/PWA build keeps the JS `Tabs` renderer in `_layout.tsx`.
 */
export default function NativeTabsLayout() {
  const { colors } = useTheme();
  const { isWide } = useResponsive();
  const { has } = useBrand();
  const hasNotes = has('notes');
  const hasVault = (['pages', 'calendar', 'forms', 'feedback', 'boards'] as Capability[]).some(has);
  return (
    <NativeTabs
      // On wide native layouts the AppFrame desktop sidebar replaces the bottom bar.
      hidden={isWide}
      tintColor={colors.accent}
      backgroundColor={colors.paper}
      iconColor={{ default: colors.inkMuted }}
      labelStyle={{
        default: { fontFamily: fonts.bodyMedium, color: colors.inkMuted },
        selected: { fontFamily: fonts.bodyMedium, color: colors.accent },
      }}
    >
      {hasVault && (
        <NativeTabs.Trigger name="work">
          <NativeTabs.Trigger.Label>Vault</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon src={<NativeTabs.Trigger.VectorIcon family={Feather} name="briefcase" />} />
        </NativeTabs.Trigger>
      )}
      <NativeTabs.Trigger name="agents">
        <NativeTabs.Trigger.Label>Agents</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={<NativeTabs.Trigger.VectorIcon family={Ionicons} name="sparkles-outline" />} />
      </NativeTabs.Trigger>
      {hasNotes && (
        <NativeTabs.Trigger name="notes">
          <NativeTabs.Trigger.Label>Notes</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon src={<NativeTabs.Trigger.VectorIcon family={Feather} name="book-open" />} />
        </NativeTabs.Trigger>
      )}
      <NativeTabs.Trigger name="search" role="search">
        <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={<NativeTabs.Trigger.VectorIcon family={Feather} name="search" />} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
