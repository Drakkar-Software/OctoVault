import type { ReactNode, RefObject } from 'react';
import type { View as ViewType } from 'react-native';

import { useResponsive } from '@/lib/use-responsive';
import { Popover } from '@/components/ui/Popover';
import { Sheet } from '@/components/ui/Sheet';

interface AdaptiveMenuProps {
  visible: boolean;
  onClose: () => void;
  /** Anchor view for {@link Popover} placement on wide screens. */
  anchorRef: RefObject<ViewType | null>;
  /** Sheet title on narrow screens. */
  title: string;
  children: ReactNode;
}

/**
 * One menu definition, two surfaces: anchored {@link Popover} on wide screens,
 * bottom {@link Sheet} on phones. Wrap {@link Menu}/{@link MenuItem} children
 * for a cross-platform action list triggered by a **button** (press, not long-press).
 *
 * For **long-press** context menus (no fixed button anchor) use `Sheet` directly
 * instead — a bottom sheet reads more naturally for positionally-ambiguous triggers.
 *
 * ```tsx
 * const anchorRef = useRef<View>(null);
 * const [open, setOpen] = useState(false);
 *
 * <View ref={anchorRef}>
 *   <IconButton name="dots" onPress={() => setOpen(true)} />
 * </View>
 * <AdaptiveMenu visible={open} onClose={() => setOpen(false)} anchorRef={anchorRef} title="Actions">
 *   <Menu>
 *     <MenuItem label="Delete" danger onPress={…} />
 *   </Menu>
 * </AdaptiveMenu>
 * ```
 */
export function AdaptiveMenu({ visible, onClose, anchorRef, title, children }: AdaptiveMenuProps) {
  const { isWide } = useResponsive();
  if (isWide) {
    return (
      <Popover visible={visible} onClose={onClose} anchorRef={anchorRef} placement="bottom-start">
        {children}
      </Popover>
    );
  }
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {children}
    </Sheet>
  );
}
