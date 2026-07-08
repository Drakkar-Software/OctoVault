'use client';
import SegmentedControlNative from '@expo/ui/community/segmented-control';

export interface SegmentedControlProps {
  /** Segment labels, in order. */
  values: string[];
  /** Index of the selected segment. */
  selectedIndex: number;
  /** Called with the tapped segment's index. */
  onSelect: (index: number) => void;
  /** `false` blocks interaction. */
  enabled?: boolean;
  /** Accent (Android/web only; iOS uses the system tint). */
  tintColor?: string;
}

/**
 * Native segmented control — the community `@expo/ui` control (real
 * UISegmentedControl on iOS, Material on Android, a vendored web fallback). Not
 * Host-based, so no `OctoHost` wrapper. The app uses this on iOS only and keeps
 * its brand pill on Android/web.
 */
export function SegmentedControl({ values, selectedIndex, onSelect, enabled, tintColor }: SegmentedControlProps) {
  return (
    <SegmentedControlNative
      values={values}
      selectedIndex={selectedIndex}
      enabled={enabled}
      tintColor={tintColor}
      onChange={(e) => onSelect(e.nativeEvent.selectedSegmentIndex)}
    />
  );
}
