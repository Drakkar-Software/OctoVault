'use client';
import { createContext, useContext } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Host } from '@expo/ui';
import type { UniversalHostProps } from '@expo/ui';

import { useOctoUITheme } from '../theme/context';

const HostContext = createContext(false);

interface OctoHostProps extends UniversalHostProps {
  children: ReactNode;
}

/**
 * Themed @expo/ui `Host` — `seedColor` defaults to the app's accent so nested
 * native controls (Button/Switch/SegmentedControl/…) inherit the Ink & Pearl
 * indigo on iOS (SwiftUI tint) / Android (Material3 palette) / web (CSS vars),
 * and flip with the OS scheme because the app feeds the live `useTheme()` accent
 * into `OctoUIThemeProvider`. Marks descendants via `HostContext` so nested
 * self-hosting primitives render bare instead of each creating their own bridge.
 */
export function OctoHost({ children, seedColor, ...rest }: OctoHostProps) {
  const theme = useOctoUITheme();
  return (
    <Host seedColor={seedColor ?? theme.accent} {...rest}>
      <HostContext.Provider value={true}>{children}</HostContext.Provider>
    </Host>
  );
}

/**
 * Wraps `node` in an `OctoHost` unless it is already inside one — collapses a
 * tree of self-hosting native primitives down to a single native Host bridge.
 * `hostProps` (e.g. `matchContents`) applies only when this call creates the
 * Host; it's ignored when collapsing into an ancestor's, since a Host's sizing
 * is fixed at mount.
 */
export function useHostWrap(node: ReactElement, hostProps?: Partial<UniversalHostProps>): ReactElement {
  const insideHost = useContext(HostContext);
  return insideHost ? node : <OctoHost {...hostProps}>{node}</OctoHost>;
}

export { HostContext };
