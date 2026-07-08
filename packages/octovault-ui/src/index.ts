// @octovault/ui — the single import surface for native UI primitives.
//
// IMPORTANT: this barrel is the ONLY export subpath. Never add per-file export
// subpaths to package.json — in a sibling project a new subpath resolved to an
// unbuilt dist path on web and broke `expo export`. Everything re-exports here.

export { OctoUIThemeProvider, useOctoUITheme } from './theme/context';
export type { OctoUITheme } from './theme/context';

export { OctoHost, useHostWrap, HostContext } from './_host/Host';

export { Switch } from './Switch';
export type { SwitchProps } from './Switch';

export { SegmentedControl } from './SegmentedControl';
export type { SegmentedControlProps } from './SegmentedControl';

export { DateTimePicker } from './DateTimePicker';
export type { DateTimePickerProps } from './DateTimePicker';

export { BottomSheet } from './BottomSheet';
