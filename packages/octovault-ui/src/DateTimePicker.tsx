'use client';
// Native date/time picker — the community @expo/ui drop-in (SwiftUI DatePicker
// on iOS, Material on Android, a clean web fallback). Same shape as the
// @react-native-community/datetimepicker it replaces, so the app's existing
// buffer-and-commit flow carries over unchanged. Metro resolves the `.web` split
// on web, so this import never pulls the native module into the web bundle.
export { DateTimePicker } from '@expo/ui/community/datetime-picker';
export type { DateTimePickerProps } from '@expo/ui/community/datetime-picker';
