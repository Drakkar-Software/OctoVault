/**
 * Object type registry — the single place that maps an {@link ObjectType} (builtin OR
 * user-defined) to how the app treats it: which content sync model it uses, which icon
 * renders it, which editor opens it, and what structured props it supports. Keeping this
 * open-ended is what lets a custom type drop in without a renderer rewrite — unknown types
 * resolve to a generic descriptor (a merge-doc with a neutral glyph) instead of being
 * special-cased away.
 *
 * Pure data/logic (no React) so any layer — hooks picking a collection, the tree
 * picking a glyph — reads the same descriptors.
 */
import type { IconName } from './icon-name';
import type { ObjectContentKind, ObjectNode, ObjectType, PropValue } from './types';
import type { TypeDef } from '../starfish/object-types-store';
import type { Capability } from './capabilities';

/** The fixed renderer a type reuses — a closed set of editors the app ships.
 *  Data can declare new types but cannot ship new renderers without a code change. */
export type EditorKind = 'page' | 'board' | 'file' | 'record' | 'calendar' | 'form' | 'feedback' | 'none';

export type PropKind = 'text' | 'number' | 'select' | 'date' | 'checkbox' | 'url' | 'relation';

export interface PropOption {
  id: string;
  label: string;
  color?: string;
}

export interface PropField {
  key: string;
  label: string;
  kind: PropKind;
  options?: PropOption[];
  required?: boolean;
}

export interface TypeDescriptor {
  /** Default content sync model for this type (a node's own `contentKind` overrides). */
  contentKind: ObjectContentKind;
  icon: IconName;
  label: string;
  /** The fixed renderer this type opens in. */
  editor: EditorKind;
  /** Declared structured property fields. */
  props: PropField[];
  /** Whether this type appears in the "create new" menus. */
  creatable: boolean;
  /** Whether this type appears in the workspace sidebar tree. Unknown types default to true. */
  workTree: boolean;
  /** Whether this type is searchable in quick-find / command palette. Unknown types default to true. */
  findable: boolean;
  /** Placeholder title for a newly created object. */
  defaultTitle?: string;
  /** Theme color swatch for the type pill (undefined = default accent). */
  color?: string;
  /** Which app capability this type belongs to. */
  capability?: Capability;
}

/** @deprecated Use {@link TypeDescriptor} — kept for legacy call sites reading only icon/label/contentKind. */
export type ObjectDescriptor = TypeDescriptor;

const TASK_PROPS: PropField[] = [
  {
    key: 'status',
    label: 'Status',
    kind: 'select',
    options: [
      { id: 'todo', label: 'To do' },
      { id: 'doing', label: 'In progress' },
      { id: 'done', label: 'Done' },
    ],
  },
  { key: 'columnId', label: 'Column', kind: 'text' },
  { key: 'order', label: 'Order', kind: 'number' },
];

const BLOB_PROPS: PropField[] = [
  { key: 'blobId', label: 'Blob', kind: 'text' },
  { key: 'mime', label: 'MIME type', kind: 'text' },
  { key: 'size', label: 'Size', kind: 'number' },
  { key: 'name', label: 'Filename', kind: 'text' },
];

const NOTE_PROPS: PropField[] = [
  { key: 'tags', label: 'Tags', kind: 'text' },
];

const BUILTIN_DESCRIPTORS: Record<string, TypeDescriptor> = {
  // OctoVault primary types
  folder:   { contentKind: 'none',   icon: 'folder', label: 'Folder',   editor: 'none',   props: [],         creatable: true,  workTree: false, findable: false },
  page:     { contentKind: 'append', icon: 'file',   label: 'Page',     editor: 'page',   props: [],         creatable: true,  workTree: true,  findable: true,  defaultTitle: 'Untitled',          capability: 'pages' as Capability },
  board:    { contentKind: 'append', icon: 'work',   label: 'Board',    editor: 'board',  props: [],         creatable: true,  workTree: true,  findable: true,  defaultTitle: 'Untitled Board',    capability: 'boards' as Capability },
  task:     { contentKind: 'append', icon: 'check',  label: 'Task',     editor: 'page',   props: TASK_PROPS, creatable: false, workTree: false, findable: false },
  file:     { contentKind: 'none',   icon: 'file',   label: 'File',     editor: 'file',   props: BLOB_PROPS, creatable: true,  workTree: false, findable: false, defaultTitle: 'Untitled File' },
  image:    { contentKind: 'none',   icon: 'image',  label: 'Image',    editor: 'file',   props: BLOB_PROPS, creatable: true,  workTree: false, findable: false, defaultTitle: 'Untitled Image' },
  // Automation: stream-bot integration node; not yet creatable from the UI.
  automation: { contentKind: 'none', icon: 'stream', label: 'Automation', editor: 'none', props: [], creatable: false, workTree: false, findable: false },
  // Sub-app variant types
  note:     { contentKind: 'append', icon: 'file',   label: 'Note',     editor: 'page',     props: NOTE_PROPS, creatable: false, workTree: false, findable: true,  defaultTitle: 'Untitled Note',     capability: 'notes' as Capability },
  calendar: { contentKind: 'append', icon: 'clock',  label: 'Calendar', editor: 'calendar', props: [],         creatable: true,  workTree: true,  findable: true,  defaultTitle: 'Untitled Calendar', capability: 'calendar' as Capability },
  form:     { contentKind: 'append', icon: 'layers', label: 'Form',     editor: 'form',     props: [],         creatable: true,  workTree: true,  findable: true,  defaultTitle: 'Untitled Form',     capability: 'forms' as Capability },
  feedback: { contentKind: 'append', icon: 'check',  label: 'Feedback', editor: 'feedback', props: [],         creatable: true,  workTree: true,  findable: true,  defaultTitle: 'Untitled Feedback', capability: 'feedback' as Capability },
  // Removed types — tombstones so legacy nodes in existing spaces stay hidden (workTree: false)
  // rather than falling through to the generic descriptor (workTree: true). Not creatable.
  room:     { contentKind: 'none', icon: 'layers', label: 'Channel',  editor: 'none', props: [], creatable: false, workTree: false, findable: false },
  category: { contentKind: 'none', icon: 'folder', label: 'Category', editor: 'none', props: [], creatable: false, workTree: false, findable: false },
};

/** The fallback for an unknown (custom) type: a structureless-until-declared object
 *  that renders generically. Its content model comes from the NODE's `contentKind`
 *  (see {@link contentKindOf}); the descriptor's is only the last-resort default. */
const GENERIC: TypeDescriptor = { contentKind: 'merge', icon: 'layers', label: 'Object', editor: 'record', props: [], creatable: false, workTree: true, findable: true };

/** Resolve a type's descriptor — a builtin, or the generic fallback for a custom type. */
export function objectDescriptor(type: ObjectType): TypeDescriptor {
  return BUILTIN_DESCRIPTORS[type] ?? GENERIC;
}

/** Resolve the display icon for a node from its type descriptor. */
export function iconForNode(node: Pick<ObjectNode, 'type'>): IconName {
  return objectDescriptor(node.type).icon;
}

/** A container type holds children but has no content of its own (folder/category) —
 *  in the tree it toggles open/closed instead of opening a content route. */
export function isContainerType(type: ObjectType): boolean {
  return objectDescriptor(type).editor === 'none';
}

/** Whether a node appears in the workspace sidebar tree. Unknown custom types default to shown. */
export function showsInWorkTree(node: Pick<ObjectNode, 'type'>): boolean {
  return objectDescriptor(node.type).workTree;
}

/** Whether a type can be opened in an editor (clicking navigates rather than toggling). */
export function isOpenableObjectType(type: ObjectType): boolean {
  return objectDescriptor(type).editor !== 'none';
}

/** Whether a type is surfaced in quick-find and search. Unknown custom types default to findable. */
export function isFindableType(type: ObjectType): boolean {
  return objectDescriptor(type).findable;
}

/** The effective content sync model for a node: its explicit `contentKind` wins (a
 *  custom type declares its own), else the type descriptor's default. */
export function contentKindOf(node: Pick<ObjectNode, 'type' | 'contentKind'>): ObjectContentKind {
  return node.contentKind ?? objectDescriptor(node.type).contentKind;
}

export interface CreatableTypeEntry extends TypeDescriptor {
  type: ObjectType;
}

/** Types the user can explicitly create from the "new object" menus. */
export function creatableTypes(): CreatableTypeEntry[] {
  return (Object.entries(BUILTIN_DESCRIPTORS) as [ObjectType, TypeDescriptor][])
    .filter(([, d]) => d.creatable)
    .map(([type, d]) => ({ type, ...d }));
}

/** Default `props` map for a newly created object of this type (all fields absent = empty map). */
export function defaultProps(_type: ObjectType): Record<string, PropValue> {
  return {};
}

// ── TypeRegistry — merges built-ins with user-defined custom types ────────────

export interface TypeRegistry {
  descriptor: (type: string) => TypeDescriptor;
  creatableTypes: () => CreatableTypeEntry[];
  showsInWorkTree: (node: Pick<ObjectNode, 'type'>) => boolean;
  iconForNode: (node: Pick<ObjectNode, 'type'>) => IconName;
  isFindableType: (type: string) => boolean;
  isContainerType: (type: string) => boolean;
  isOpenableType: (type: string) => boolean;
  /** All types — built-in + custom (non-archived). */
  allTypes: () => Array<CreatableTypeEntry & { isCustom: boolean }>;
}

/** Map a user {@link TypeDef} to the built-in {@link TypeDescriptor} shape. */
function typeDefToDescriptor(def: TypeDef): TypeDescriptor {
  return {
    contentKind: def.contentKind as ObjectContentKind,
    icon: (def.icon as IconName) || 'layers',
    label: def.label,
    editor: def.editorKind,
    props: def.fields.map((f) => ({
      key: f.key,
      label: f.label,
      kind: f.kind,
      options: f.options,
      required: f.required,
    })),
    creatable: def.creatable,
    workTree: true,
    findable: true,
    color: def.color,
  };
}

/** Build a merged TypeRegistry from built-ins + custom TypeDefs.
 *  Custom types with the same id as a built-in are IGNORED (built-ins win). */
export function makeRegistry(customTypes: TypeDef[]): TypeRegistry {
  const customMap = new Map<string, TypeDescriptor>();
  for (const def of customTypes) {
    if (!BUILTIN_DESCRIPTORS[def.id]) {
      customMap.set(def.id, typeDefToDescriptor(def));
    }
  }

  const descriptor = (type: string): TypeDescriptor =>
    BUILTIN_DESCRIPTORS[type] ?? customMap.get(type) ?? GENERIC;

  const creatableTypes = (): CreatableTypeEntry[] => {
    const builtins = (Object.entries(BUILTIN_DESCRIPTORS) as [ObjectType, TypeDescriptor][])
      .filter(([, d]) => d.creatable)
      .map(([type, d]) => ({ type, ...d }));
    const customs: CreatableTypeEntry[] = [];
    for (const [type, d] of customMap) {
      if (d.creatable) customs.push({ type: type as ObjectType, ...d });
    }
    return [...builtins, ...customs];
  };

  return {
    descriptor,
    creatableTypes,
    showsInWorkTree: (node) => descriptor(node.type).workTree,
    iconForNode: (node) => descriptor(node.type).icon,
    isFindableType: (type) => descriptor(type).findable,
    isContainerType: (type) => descriptor(type).editor === 'none',
    isOpenableType: (type) => descriptor(type).editor !== 'none',
    allTypes: () => {
      const builtins = (Object.entries(BUILTIN_DESCRIPTORS) as [ObjectType, TypeDescriptor][]).map(
        ([type, d]) => ({ type, ...d, isCustom: false }),
      );
      const customs = Array.from(customMap.entries()).map(([type, d]) => ({
        type: type as ObjectType,
        ...d,
        isCustom: true,
      }));
      return [...builtins, ...customs];
    },
  };
}

/** A static registry containing only built-in types (no React context needed).
 *  Use this at non-React call sites; React components should use `useTypeRegistry()`. */
export const BUILTIN_REGISTRY: TypeRegistry = makeRegistry([]);

/** The detail route an object opens into — collapses to a single generic route now that
 *  every object type (page, board, task, file, image, custom) is handled by one screen. */
export function routeForNode(_node: Pick<ObjectNode, 'type'>): '/work/object/[id]' {
  return '/work/object/[id]';
}

/**
 * Absolute shareable URL for an object — the "Copy link" target. Web-only by
 * construction (it needs a routable origin; a native deep-link scheme would not
 * open for a collaborator), so it returns `null` off web and callers hide the
 * affordance.
 */
export function objectLink(spaceId: string, node: Pick<ObjectNode, 'id' | 'type'>): string | null {
  const origin = (globalThis as { location?: { origin?: string } }).location?.origin;
  if (!origin) return null;
  return `${origin}${routeForNode(node).replace('[id]', node.id)}?spaceId=${encodeURIComponent(spaceId)}`;
}
