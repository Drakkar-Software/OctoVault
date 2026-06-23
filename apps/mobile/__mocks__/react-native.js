// Minimal React Native stub for vitest — covers symbols that leak via theme.ts → octospaces-ui.
const noop = () => {};
const noopComponent = () => null;

const StyleSheet = {
  create: (s) => s,
  flatten: (s) => (Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean)) : s ?? {}),
  hairlineWidth: 0.5,
  absoluteFill: { position: 'absolute', top: 0, left: 0, bottom: 0, right: 0 },
};

module.exports = {
  StyleSheet,
  View: noopComponent,
  Text: noopComponent,
  TextInput: noopComponent,
  Pressable: noopComponent,
  FlatList: noopComponent,
  ScrollView: noopComponent,
  RefreshControl: noopComponent,
  ActivityIndicator: noopComponent,
  Platform: { OS: 'web', select: (m) => m.web ?? m.default },
  Animated: { View: noopComponent, Value: class { constructor(v) { this._value = v; } }, timing: noop, spring: noop, sequence: noop, parallel: noop },
  Dimensions: { get: () => ({ width: 375, height: 812 }) },
  PixelRatio: { get: () => 2, roundToNearestPixel: (n) => n },
  Keyboard: { dismiss: noop, addListener: () => ({ remove: noop }) },
  Alert: { alert: noop },
};
