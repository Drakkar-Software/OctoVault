import { useMemo } from 'react';

import { useObjectContent, useWalMutator } from './use-object-content';
import {
  readFields,
  readResponses,
  addFormField,
  deleteFormField,
  moveFormField,
  patchFormField,
  addResponse,
  type FormField,
  type FormResponse,
  type FormFieldKind,
} from '@drakkar.software/octovault-sdk';

export type { FormField, FormFieldOption, FormFieldKind, FormResponse } from '@drakkar.software/octovault-sdk';

export interface FormHook {
  fields: FormField[];
  responses: FormResponse[];
  ready: boolean;
  opening: boolean;
  openError: string | null;
  offline: boolean;
  reload: () => void;
  addField: (init?: Partial<FormField>) => string | undefined;
  deleteField: (id: string) => void;
  moveField: (id: string, toIndex: number) => void;
  patchField: (id: string, patch: Partial<Omit<FormField, 'id'>>) => void;
  addResponse: (submitter: string, data: Record<string, unknown>) => string | undefined;
}

export function useForm(spaceId: string, objectId: string, opts: { enabled?: boolean } = {}): FormHook {
  const { walDoc: doc, ready, version, touch, opening, openError, offline, reload } = useObjectContent(
    spaceId,
    objectId,
    'append',
    opts,
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fields = useMemo<FormField[]>(() => (doc ? readFields(doc) : []), [doc, version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const responses = useMemo<FormResponse[]>(() => (doc ? readResponses(doc) : []), [doc, version]);

  const mut = useWalMutator(doc, touch);

  return {
    fields,
    responses,
    ready,
    opening,
    openError,
    offline,
    reload,
    addField: (init) => mut((d) => addFormField(d, init)),
    deleteField: (id) => mut((d) => deleteFormField(d, id)),
    moveField: (id, toIndex) => mut((d) => moveFormField(d, id, toIndex)),
    patchField: (id, patch) => mut((d) => patchFormField(d, id, patch)),
    addResponse: (submitter, data) => mut((d) => addResponse(d, submitter, data, Date.now())),
  };
}
