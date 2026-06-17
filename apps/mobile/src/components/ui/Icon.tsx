import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentType } from 'react';

import type { IconName } from '@drakkar.software/octovault-sdk';
import { useTheme } from '@/lib/use-theme';

export type { IconName };

// Each vendor set types `name` as its own literal union; we map to a generic
// component and pass the resolved glyph name through.
type IconLib = ComponentType<any>;
type IconDef = { lib: IconLib; n: string };

/**
 * Curated, semantic icon set for OctoVault. Each maps to a production glyph from
 * @expo/vector-icons so the line-art stays consistent across web and native.
 */
const ICONS = {
  hash: { lib: Feather, n: 'hash' },
  stream: { lib: Feather, n: 'activity' },
  lock: { lib: Feather, n: 'lock' },
  unlock: { lib: Feather, n: 'unlock' },
  plus: { lib: Feather, n: 'plus' },
  'plus-circle': { lib: Feather, n: 'plus-circle' },
  search: { lib: Feather, n: 'search' },
  send: { lib: Feather, n: 'send' },
  paperclip: { lib: Feather, n: 'paperclip' },
  smile: { lib: Feather, n: 'smile' },
  reply: { lib: Feather, n: 'corner-up-left' },
  thread: { lib: Feather, n: 'git-pull-request' },
  dm: { lib: Feather, n: 'message-square' },
  pin: { lib: MaterialCommunityIcons, n: 'pin' },
  mic: { lib: Feather, n: 'mic' },
  image: { lib: Feather, n: 'image' },
  video: { lib: Feather, n: 'video' },
  file: { lib: Feather, n: 'file' },
  link: { lib: Feather, n: 'link-2' },
  qr: { lib: MaterialCommunityIcons, n: 'qrcode' },
  'qr-scan': { lib: MaterialCommunityIcons, n: 'qrcode-scan' },
  check: { lib: Feather, n: 'check' },
  'check-circle': { lib: Feather, n: 'check-circle' },
  chev: { lib: Feather, n: 'chevron-right' },
  'chevron-down': { lib: Feather, n: 'chevron-down' },
  'chevron-up': { lib: Feather, n: 'chevron-up' },
  gear: { lib: Feather, n: 'settings' },
  bell: { lib: Feather, n: 'bell' },
  volume: { lib: Feather, n: 'volume-2' },
  'volume-off': { lib: Feather, n: 'volume-x' },
  menu: { lib: Feather, n: 'menu' },
  x: { lib: Feather, n: 'x' },
  'arrow-l': { lib: Feather, n: 'arrow-left' },
  'arrow-r': { lib: Feather, n: 'arrow-right' },
  shield: { lib: Feather, n: 'shield' },
  people: { lib: Feather, n: 'users' },
  user: { lib: Feather, n: 'user' },
  dots: { lib: Feather, n: 'more-horizontal' },
  'dots-v': { lib: Feather, n: 'more-vertical' },
  camera: { lib: Feather, n: 'camera' },
  key: { lib: Feather, n: 'key' },
  devices: { lib: MaterialCommunityIcons, n: 'devices' },
  copy: { lib: Feather, n: 'copy' },
  eye: { lib: Feather, n: 'eye' },
  'eye-off': { lib: Feather, n: 'eye-off' },
  alert: { lib: Feather, n: 'alert-triangle' },
  info: { lib: Feather, n: 'info' },
  edit: { lib: Feather, n: 'edit-2' },
  trash: { lib: Feather, n: 'trash-2' },
  logout: { lib: Feather, n: 'log-out' },
  at: { lib: Feather, n: 'at-sign' },
  clock: { lib: Feather, n: 'clock' },
  refresh: { lib: Feather, n: 'refresh-cw' },
  zap: { lib: Feather, n: 'zap' },
  globe: { lib: Ionicons, n: 'globe-outline' },
  folder: { lib: Feather, n: 'folder' },
  share: { lib: Feather, n: 'share' },
  // Workspace mode switcher (Chat / Agents / Work) + Work-mode group glyphs.
  chat: { lib: Feather, n: 'message-circle' },
  agents: { lib: Ionicons, n: 'sparkles-outline' },
  work: { lib: Feather, n: 'briefcase' },
  book: { lib: Feather, n: 'book-open' },
  target: { lib: Feather, n: 'target' },
  layers: { lib: Feather, n: 'layers' },
  // Block-editor vocabulary (block-type menu / slash menu / gutter handles).
  text: { lib: Feather, n: 'type' },
  heading: { lib: MaterialCommunityIcons, n: 'format-header-1' },
  subheading: { lib: MaterialCommunityIcons, n: 'format-header-2' },
  list: { lib: Feather, n: 'list' },
  'list-numbered': { lib: MaterialCommunityIcons, n: 'format-list-numbered' },
  todo: { lib: Feather, n: 'check-square' },
  quote: { lib: MaterialCommunityIcons, n: 'format-quote-close' },
  code: { lib: Feather, n: 'code' },
  minus: { lib: Feather, n: 'minus' },
  callout: { lib: MaterialCommunityIcons, n: 'card-text-outline' },
  palette: { lib: MaterialCommunityIcons, n: 'palette-outline' },
  grip: { lib: MaterialCommunityIcons, n: 'drag-vertical' },
  expand: { lib: Feather, n: 'maximize-2' },
  // Slash/turn-into menu: one glyph per insertable block type, named for what
  // it inserts (the presentation-table aliases consumers reach for first).
  h1: { lib: MaterialCommunityIcons, n: 'format-header-1' },
  h2: { lib: MaterialCommunityIcons, n: 'format-header-2' },
  'quote-mark': { lib: MaterialCommunityIcons, n: 'format-quote-close' },
  'code-block': { lib: Feather, n: 'code' },
  'list-bullet': { lib: MaterialCommunityIcons, n: 'format-list-bulleted' },
  'list-number': { lib: MaterialCommunityIcons, n: 'format-list-numbered' },
  'toggle-chev': { lib: MaterialCommunityIcons, n: 'menu-right' },
  page: { lib: Feather, n: 'file-text' },
  // Todo / done states as true squares (the rounded `todo` glyph stays for menus).
  square: { lib: Feather, n: 'square' },
  'square-check': { lib: Feather, n: 'check-square' },
  drag: { lib: MaterialCommunityIcons, n: 'drag-vertical' },
  // Context menus, tooltips & shell chrome (row actions, breadcrumb trails…).
  duplicate: { lib: Feather, n: 'copy' },
  'move-to': { lib: Feather, n: 'corner-up-right' },
  restore: { lib: Feather, n: 'rotate-ccw' },
  sidebar: { lib: Feather, n: 'sidebar' },
  external: { lib: Feather, n: 'external-link' },
  emoji: { lib: Feather, n: 'smile' },
  'chev-down': { lib: Feather, n: 'chevron-down' },
  'chev-right': { lib: Feather, n: 'chevron-right' },
  'arrow-up': { lib: Feather, n: 'arrow-up' },
  'arrow-down': { lib: Feather, n: 'arrow-down' },
  // Keyboard hints (shortcut captions in menus and tooltips).
  enter: { lib: Feather, n: 'corner-down-left' },
  command: { lib: Feather, n: 'command' },
  // Table block
  table: { lib: MaterialCommunityIcons, n: 'table' },
  filter: { lib: MaterialCommunityIcons, n: 'filter-variant' },
} satisfies Record<string, IconDef>;

export const ICON_NAMES: IconName[] = Object.keys(ICONS) as IconName[];

interface IconProps {
  name: IconName;
  size?: number;
  /** Defaults to the soft ink color. */
  color?: string;
}

export function Icon({ name, size = 16, color }: IconProps) {
  const { colors } = useTheme();
  const def = ICONS[name];
  const Glyph = def.lib as IconLib;
  return <Glyph name={def.n} size={size} color={color ?? colors.inkSoft} />;
}
