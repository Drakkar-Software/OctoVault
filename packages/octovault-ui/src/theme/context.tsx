import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

/**
 * The minimal token contract the native primitives need. The app owns the full
 * palette in `src/theme.ts`; it feeds these few values into `OctoUIThemeProvider`
 * from `useTheme()` so the package never imports the app's theme directly.
 *
 * Token nuance: `paper` is the SOLID raised surface (`#fffdf8` / dark), used for
 * native sheet backgrounds — NOT the app's `surface` token, which is translucent
 * and would ghost the screen behind a sheet.
 */
export interface OctoUITheme {
  /** Accent used as the native Host `seedColor` (SwiftUI tint / Material3 palette). */
  accent: string;
  /** Solid raised surface — native sheet/menu background. */
  paper: string;
  /** Destructive role color. */
  danger: string;
  /** Primary text/glyph color. */
  ink: string;
  /** Secondary text/glyph color. */
  inkSoft: string;
  /** Label color drawn on a solid accent fill. */
  onAccent: string;
  /** Backdrop scrim behind modals. */
  scrim: string;
}

const DEFAULT: OctoUITheme = {
  accent: '#5847c9',
  paper: '#fffdf8',
  danger: '#c0392b',
  ink: '#1b1a17',
  inkSoft: '#46443d',
  onAccent: '#ffffff',
  scrim: 'rgba(0,0,0,0.4)',
};

const OctoUIThemeContext = createContext<OctoUITheme>(DEFAULT);

export function OctoUIThemeProvider({ value, children }: { value: OctoUITheme; children: ReactNode }) {
  return <OctoUIThemeContext.Provider value={value}>{children}</OctoUIThemeContext.Provider>;
}

export function useOctoUITheme(): OctoUITheme {
  return useContext(OctoUIThemeContext);
}
