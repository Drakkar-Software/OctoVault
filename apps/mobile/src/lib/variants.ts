import type { Capability } from '@drakkar.software/octovault-sdk';

export type VariantId = 'octovault' | 'octonotes' | 'octoboard' | 'octocalendar' | 'octoforms' | 'octofeedback';

export interface VariantConfig {
  id: VariantId;
  name: string;
  slug: string;
  scheme: string;
  bundleId: string;
  linkHost: string;
  easProjectId: string;
  appName: string;
  wordmarkSuffix: string;
  features: Capability[];
}

export const VARIANTS: Record<VariantId, VariantConfig> = {
  octovault: {
    id: 'octovault',
    name: 'OctoVault',
    slug: 'octovault',
    scheme: 'octovault',
    bundleId: 'com.drakkarsoftware.octovault',
    linkHost: 'vault.drakkar.software',
    easProjectId: 'd948d498-d957-4ae6-abe8-4b2487dec9f5',
    appName: 'OctoVault',
    wordmarkSuffix: 'Vault',

    features: ['pages', 'notes', 'calendar', 'forms', 'feedback'],
  },
  octonotes: {
    id: 'octonotes',
    name: 'OctoNotes',
    slug: 'octonotes',
    scheme: 'octonotes',
    bundleId: 'com.drakkarsoftware.octonotes',
    linkHost: 'notes.drakkar.software',
    easProjectId: 'OCTONOTES_EAS_PROJECT_ID',
    appName: 'OctoNotes',
    wordmarkSuffix: 'Notes',

    features: ['notes'],
  },
  octoboard: {
    id: 'octoboard',
    name: 'OctoBoard',
    slug: 'octoboard',
    scheme: 'octoboard',
    bundleId: 'com.drakkarsoftware.octoboard',
    linkHost: 'board.drakkar.software',
    easProjectId: 'OCTOBOARD_EAS_PROJECT_ID',
    appName: 'OctoBoard',
    wordmarkSuffix: 'Board',

    features: ['boards'],
  },
  octocalendar: {
    id: 'octocalendar',
    name: 'OctoCalendar',
    slug: 'octocalendar',
    scheme: 'octocalendar',
    bundleId: 'com.drakkarsoftware.octocalendar',
    linkHost: 'cal.drakkar.software',
    easProjectId: 'OCTOCALENDAR_EAS_PROJECT_ID',
    appName: 'OctoCalendar',
    wordmarkSuffix: 'Calendar',

    features: ['calendar'],
  },
  octoforms: {
    id: 'octoforms',
    name: 'OctoForms',
    slug: 'octoforms',
    scheme: 'octoforms',
    bundleId: 'com.drakkarsoftware.octoforms',
    linkHost: 'forms.drakkar.software',
    easProjectId: 'OCTOFORMS_EAS_PROJECT_ID',
    appName: 'OctoForms',
    wordmarkSuffix: 'Forms',

    features: ['forms'],
  },
  octofeedback: {
    id: 'octofeedback',
    name: 'OctoFeedback',
    slug: 'octofeedback',
    scheme: 'octofeedback',
    bundleId: 'com.drakkarsoftware.octofeedback',
    linkHost: 'feedback.drakkar.software',
    easProjectId: 'OCTOFEEDBACK_EAS_PROJECT_ID',
    appName: 'OctoFeedback',
    wordmarkSuffix: 'Feedback',

    features: ['feedback'],
  },
};

const raw = process.env.EXPO_PUBLIC_VARIANT as VariantId | undefined;
export const ACTIVE_VARIANT: VariantId = raw != null && raw in VARIANTS ? raw : 'octovault';
export const activeVariant: VariantConfig = VARIANTS[ACTIVE_VARIANT];
