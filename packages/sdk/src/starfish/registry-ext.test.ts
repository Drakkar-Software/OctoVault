import { beforeEach, describe, expect, it, vi } from 'vitest';

// registry-ext now imports updateSpacesDoc + removeSpaceAccessEntry from starfish-spaces
// (moved there in octospaces-sdk 0.23+). Mock the correct module.
vi.mock('@drakkar.software/starfish-spaces', () => ({
  updateSpacesDoc: vi.fn(),
  removeSpaceAccessEntry: vi.fn(),
}));

import { leaveSpace, CategoryError } from './registry-ext';
import { updateSpacesDoc, removeSpaceAccessEntry } from '@drakkar.software/starfish-spaces';

type SpacesDocSlice = {
  spaces: { id: string; name: string }[];
  caps: Record<string, unknown>;
  pubAccess: Record<string, unknown>;
};

function setupUpdateSpacesDoc(doc: SpacesDocSlice) {
  // Third argument is the mutator (client, session, mutator)
  vi.mocked(updateSpacesDoc).mockImplementation(async (_client, _session, mutator) => {
    mutator(doc as never);
  });
}

const FAKE_CLIENT = {} as never;
// Minimal session stub — leaveSpace only uses it to pass through to updateSpacesDoc,
// which is mocked, so the shape only needs to satisfy TypeScript.
const FAKE_SESSION = { userId: 'user-1', layout: {} } as never;

beforeEach(() => vi.clearAllMocks());

describe('leaveSpace', () => {
  it('removes the spaceId from spaces, caps, and pubAccess', async () => {
    const doc: SpacesDocSlice = {
      spaces: [{ id: 'sp-1', name: 'Space 1' }, { id: 'sp-2', name: 'Space 2' }],
      caps: { 'sp-1': 'cap-a', 'sp-2': 'cap-b' },
      pubAccess: { 'sp-1': { foo: true }, 'sp-2': { bar: true } },
    };
    setupUpdateSpacesDoc(doc);

    await leaveSpace(FAKE_CLIENT, FAKE_SESSION, 'sp-1');

    const mutator = vi.mocked(updateSpacesDoc).mock.calls[0]![2];
    const result = mutator(doc as never);
    expect(result.spaces.map((s: { id: string }) => s.id)).toEqual(['sp-2']);
    expect(result.caps).not.toHaveProperty('sp-1');
    expect(result.caps).toHaveProperty('sp-2');
    expect(result.pubAccess).not.toHaveProperty('sp-1');
    expect(result.pubAccess).toHaveProperty('sp-2');
  });

  it('calls removeSpaceAccessEntry with the spaceId', async () => {
    setupUpdateSpacesDoc({ spaces: [], caps: {}, pubAccess: {} });
    await leaveSpace(FAKE_CLIENT, FAKE_SESSION, 'sp-42');
    expect(removeSpaceAccessEntry).toHaveBeenCalledWith('sp-42');
  });

  it('is a no-op (returns cur unchanged) when spaceId is not in spaces', async () => {
    const doc: SpacesDocSlice = {
      spaces: [{ id: 'sp-other', name: 'Other' }],
      caps: { 'sp-other': 'cap-x' },
      pubAccess: {},
    };
    setupUpdateSpacesDoc(doc);
    await leaveSpace(FAKE_CLIENT, FAKE_SESSION, 'sp-missing');
    const mutator = vi.mocked(updateSpacesDoc).mock.calls[0]![2];
    const result = mutator(doc as never);
    // Returns the same reference when space not found (no-op)
    expect(result).toBe(doc);
  });
});

describe('CategoryError', () => {
  it('is an instance of Error', () => {
    expect(new CategoryError('bad name')).toBeInstanceOf(Error);
  });

  it('carries the message', () => {
    expect(new CategoryError('duplicate category').message).toBe('duplicate category');
  });
});
