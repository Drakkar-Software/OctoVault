import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import type { View as ViewType } from 'react-native';
import { StyleSheet, View } from 'react-native';

import { layout, spacing } from '@/theme';
import type { CreatableTypeEntry } from '@drakkar.software/octovault-sdk';
import { useTypeRegistry } from '@/lib/type-registry-context';
import { useResponsive } from '@/lib/use-responsive';
import { useBrand } from '@/lib/brand-context';
import type { ObjectType } from '@drakkar.software/octovault-sdk';
import { Menu, MenuItem } from '@/components/ui/Menu';
import { Popover } from '@/components/ui/Popover';
import { Segmented, type SegmentedOption } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { Txt } from '@/components/ui/Txt';

export type VisibilityAccess = 'space' | 'invite' | 'public';

const VISIBILITY_OPTIONS: SegmentedOption<VisibilityAccess>[] = [
  { value: 'space',  label: 'Space' },
  { value: 'invite', label: 'Invite' },
  { value: 'public', label: 'Public', disabled: true, hint: 'Coming soon — public objects will appear in Search.' },
];

interface CreateTypeMenuProps {
  visible: boolean;
  onClose: () => void;
  anchorRef: RefObject<ViewType | null>;
  onCreate: (type: ObjectType, access: VisibilityAccess) => void;
  disabled?: boolean;
  /** Defaults to creatableTypes() with editor !== 'file' (file/image need a picker). */
  types?: CreatableTypeEntry[];
  /** Sheet header on narrow screens. */
  title?: string;
  /** When true, the visibility selector is hidden (e.g. secondary-type sub-menus). */
  hideVisibility?: boolean;
}

/**
 * Adaptive create-type picker — Popover on wide screens, Sheet on narrow.
 * Defaults to the workTree-creatable types from the registry (page + board
 * for now; any future creatable type drops in automatically once declared).
 * File/image types are excluded until Phase E wires up the file picker.
 */
export function CreateTypeMenu({
  visible,
  onClose,
  anchorRef,
  onCreate,
  disabled,
  types,
  title = 'Create',
  hideVisibility = false,
}: CreateTypeMenuProps) {
  const { isWide } = useResponsive();
  const registry = useTypeRegistry();
  const { has } = useBrand();
  const items = types ?? registry.creatableTypes().filter((d) => d.workTree && d.editor !== 'file' && (!d.capability || has(d.capability)));
  const [access, setAccess] = useState<VisibilityAccess>('space');
  // Reset to space-default when closed so a dismissed "Invite" selection doesn't
  // persist to the next open (security: users expect the control to start neutral).
  useEffect(() => { if (!visible) setAccess('space'); }, [visible]);

  const body = (
    <View>
      {!hideVisibility ? (
        <View style={styles.visibility}>
          <Txt variant="micro" weight="bold" mono uppercase tone="inkFaint">Visibility</Txt>
          <Segmented<VisibilityAccess>
            options={VISIBILITY_OPTIONS}
            value={access}
            onChange={setAccess}
          />
          <Txt variant="caption" tone="inkFaint">
            {access === 'invite'
              ? 'Title hidden from shared index — still encrypted for all members.'
              : access === 'public'
              ? 'Visible to anyone — appears in the public directory. Not encrypted.'
              : 'Visible to all space members.'}
          </Txt>
        </View>
      ) : null}
      <Menu>
        {items.map((d) => (
          <MenuItem
            key={d.label}
            icon={d.icon}
            label={d.label}
            disabled={disabled}
            onPress={() => { onClose(); onCreate(d.type, access); }}
          />
        ))}
      </Menu>
    </View>
  );

  if (isWide) {
    return (
      <Popover visible={visible} onClose={onClose} anchorRef={anchorRef} placement="top-start" width={layout.popoverWidth}>
        {body}
      </Popover>
    );
  }
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {body}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  visibility: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.xs },
});
