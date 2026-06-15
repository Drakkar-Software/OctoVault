import { describe, expect, it } from 'vitest';
import type { ObjectNode } from '@drakkar.software/octospaces-sdk';
import {
  propsOf,
  automationOf,
  addVaultObject,
  setProps,
  clearProp,
  patchAutomation,
} from './objects-ext';
import type { AutomationMeta } from '../domain/types';

function makeNode(overrides: Partial<ObjectNode> = {}): ObjectNode {
  return {
    id: 'node-1',
    type: 'page',
    title: 'Test',
    parentId: null,
    order: 0,
    updatedAt: 0,
    access: 'space',
    ...overrides,
  };
}

const FAKE_AUTOMATION: AutomationMeta = {
  providerId: 'rss',
  params: { url: 'https://example.com/feed' },
  intervalMin: 60,
  enabled: true,
  credential: { ciphertext: new Uint8Array([1]), iv: new Uint8Array([2]) } as never,
  runOnDeviceId: null,
};

describe('propsOf', () => {
  it('returns {} for a node with no meta', () => {
    expect(propsOf(makeNode())).toEqual({});
  });

  it('returns {} when meta.props is null', () => {
    expect(propsOf(makeNode({ meta: { props: null } }))).toEqual({});
  });

  it('returns {} when meta.props is not an object', () => {
    expect(propsOf(makeNode({ meta: { props: 'bad' } }))).toEqual({});
  });

  it('returns the props bag when present', () => {
    const node = makeNode({ meta: { props: { color: 'red', count: 3 } } });
    expect(propsOf(node)).toEqual({ color: 'red', count: 3 });
  });
});

describe('automationOf', () => {
  it('returns null when no meta', () => {
    expect(automationOf(makeNode())).toBeNull();
  });

  it('returns null when meta has no automation field', () => {
    expect(automationOf(makeNode({ meta: { props: {} } }))).toBeNull();
  });

  it('returns the automation object when present', () => {
    const node = makeNode({ meta: { automation: FAKE_AUTOMATION } });
    expect(automationOf(node)).toEqual(FAKE_AUTOMATION);
  });
});

describe('addVaultObject', () => {
  it('adds a new node to the array', () => {
    const { nodes, node } = addVaultObject([], { type: 'page', title: 'Hello' }, 1000);
    expect(nodes).toHaveLength(1);
    expect(node.title).toBe('Hello');
    expect(node.type).toBe('page');
    expect(node.updatedAt).toBe(1000);
  });

  it('stores props under meta.props', () => {
    const { node } = addVaultObject([], { type: 'task', title: 'Task', props: { done: false } }, 1);
    expect(node.meta?.props).toEqual({ done: false });
  });

  it('stores automation under meta.automation', () => {
    const { node } = addVaultObject([], { type: 'automation', title: 'Bot', automation: FAKE_AUTOMATION }, 1);
    expect(node.meta?.automation).toEqual(FAKE_AUTOMATION);
  });

  it('does NOT add meta.props when props is empty', () => {
    const { node } = addVaultObject([], { type: 'page', title: 'A', props: {} }, 1);
    expect(node.meta?.props).toBeUndefined();
  });

  it('merges extra meta fields with props/automation', () => {
    const { node } = addVaultObject([], { type: 'page', title: 'B', props: { x: 1 }, meta: { custom: 'yes' } }, 1);
    expect(node.meta?.props).toEqual({ x: 1 });
    expect(node.meta?.custom).toBe('yes');
  });
});

describe('setProps', () => {
  it('merges props patch into existing meta.props', () => {
    const node = makeNode({ id: 'n1', meta: { props: { a: 1, b: 2 } } });
    const result = setProps([node], 'n1', { b: 99, c: 3 }, 500);
    expect(propsOf(result[0]!)).toEqual({ a: 1, b: 99, c: 3 });
  });

  it('bumps updatedAt on the patched node', () => {
    const node = makeNode({ id: 'n1', updatedAt: 0 });
    const result = setProps([node], 'n1', { x: 1 }, 777);
    expect(result[0]!.updatedAt).toBe(777);
  });

  it('leaves other nodes untouched', () => {
    const n1 = makeNode({ id: 'n1' });
    const n2 = makeNode({ id: 'n2', updatedAt: 42 });
    const result = setProps([n1, n2], 'n1', { k: 'v' }, 1000);
    expect(result[1]!.updatedAt).toBe(42);
    expect(propsOf(result[1]!)).toEqual({});
  });
});

describe('clearProp', () => {
  it('removes the specified key from meta.props', () => {
    const node = makeNode({ id: 'n1', meta: { props: { a: 1, b: 2 } } });
    const result = clearProp([node], 'n1', 'a', 100);
    expect(propsOf(result[0]!)).toEqual({ b: 2 });
  });

  it('bumps updatedAt', () => {
    const node = makeNode({ id: 'n1', meta: { props: { x: 1 } }, updatedAt: 0 });
    const result = clearProp([node], 'n1', 'x', 200);
    expect(result[0]!.updatedAt).toBe(200);
  });

  it('leaves other nodes untouched', () => {
    const n1 = makeNode({ id: 'n1', meta: { props: { x: 1 } } });
    const n2 = makeNode({ id: 'n2', meta: { props: { y: 2 } } });
    const result = clearProp([n1, n2], 'n1', 'x', 1);
    expect(propsOf(result[1]!)).toEqual({ y: 2 });
  });
});

describe('patchAutomation', () => {
  it('sets meta.automation when non-null', () => {
    const node = makeNode({ id: 'n1' });
    const result = patchAutomation([node], 'n1', FAKE_AUTOMATION, 1);
    expect(result[0]!.meta?.automation).toEqual(FAKE_AUTOMATION);
  });

  it('removes meta.automation when null', () => {
    const node = makeNode({ id: 'n1', meta: { automation: FAKE_AUTOMATION } });
    const result = patchAutomation([node], 'n1', null, 1);
    expect(result[0]!.meta?.automation).toBeUndefined();
  });

  it('bumps updatedAt', () => {
    const node = makeNode({ id: 'n1', updatedAt: 0 });
    const result = patchAutomation([node], 'n1', FAKE_AUTOMATION, 999);
    expect(result[0]!.updatedAt).toBe(999);
  });

  it('preserves other meta fields when patching automation', () => {
    const node = makeNode({ id: 'n1', meta: { props: { a: 1 } } });
    const result = patchAutomation([node], 'n1', FAKE_AUTOMATION, 1);
    expect(result[0]!.meta?.props).toEqual({ a: 1 });
  });
});
