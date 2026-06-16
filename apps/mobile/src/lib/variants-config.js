// CommonJS mirror of variants.ts — used by app.config.js (Expo's config system is CJS).
const VARIANTS = {
  octovault:    { name: 'OctoVault',    slug: 'octovault',    scheme: 'octovault',    bundleId: 'com.drakkarsoftware.octovault',    linkHost: 'vault.drakkar.software',     easProjectId: 'd948d498-d957-4ae6-abe8-4b2487dec9f5' },
  octonotes:    { name: 'OctoNotes',    slug: 'octonotes',    scheme: 'octonotes',    bundleId: 'com.drakkarsoftware.octonotes',    linkHost: 'notes.drakkar.software',     easProjectId: 'OCTONOTES_EAS_PROJECT_ID' },
  octoboard:    { name: 'OctoBoard',    slug: 'octoboard',    scheme: 'octoboard',    bundleId: 'com.drakkarsoftware.octoboard',   linkHost: 'board.drakkar.software',     easProjectId: 'OCTOBOARD_EAS_PROJECT_ID' },
  octocalendar: { name: 'OctoCalendar', slug: 'octocalendar', scheme: 'octocalendar', bundleId: 'com.drakkarsoftware.octocalendar', linkHost: 'cal.drakkar.software',       easProjectId: 'OCTOCALENDAR_EAS_PROJECT_ID' },
  octoforms:    { name: 'OctoForms',    slug: 'octoforms',    scheme: 'octoforms',    bundleId: 'com.drakkarsoftware.octoforms',   linkHost: 'forms.drakkar.software',     easProjectId: 'OCTOFORMS_EAS_PROJECT_ID' },
  octofeedback: { name: 'OctoFeedback', slug: 'octofeedback', scheme: 'octofeedback', bundleId: 'com.drakkarsoftware.octofeedback',linkHost: 'feedback.drakkar.software',  easProjectId: 'OCTOFEEDBACK_EAS_PROJECT_ID' },
};
module.exports = { VARIANTS };
