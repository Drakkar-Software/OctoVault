export type Capability = 'pages' | 'boards' | 'notes' | 'calendar' | 'forms' | 'feedback';

export interface CapabilityMeta {
  label: string;
  description: string;
  objectType?: string;
}

export const CAPABILITY_META: Record<Capability, CapabilityMeta> = {
  pages:    { label: 'Pages',    description: 'Rich-text pages with nested blocks',   objectType: 'page' },
  boards:   { label: 'Boards',   description: 'Kanban boards with tasks',             objectType: 'board' },
  notes:    { label: 'Notes',    description: 'Personal note-taking',                 objectType: 'note' },
  calendar: { label: 'Calendar', description: 'Event scheduling and agenda view',     objectType: 'calendar' },
  forms:    { label: 'Forms',    description: 'Form builder and response collection', objectType: 'form' },
  feedback: { label: 'Feedback', description: 'Ranked feedback with voting',          objectType: 'feedback' },
};
