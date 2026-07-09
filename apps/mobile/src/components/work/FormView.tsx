/**
 * FormView — inline field editor for OctoVault forms.
 *
 * Each field is an editable card:
 *   Label    → AutosaveField (patchField({label}))
 *   Type     → Segmented over FormFieldKind
 *   Required → ToggleRow (patchField({required}))
 *   Options  → inline editable list (only for kind=select)
 * Up/down arrows reorder fields via moveField; trash with confirm deletes.
 *
 * Responses stay read-only summary rows below the fields section.
 */
import { ScrollView, StyleSheet, View } from 'react-native';

import { layout, radii, spacing } from '@/theme';
import { relativeTime } from '@drakkar.software/octovault-sdk';
import { useForm, type FormField, type FormFieldKind, type FormResponse } from '@/lib/use-form';
import type { FormFieldOption } from '@/lib/use-form';
import { useConfirm } from '@/lib/use-confirm';
import { useTheme } from '@/lib/use-theme';
import { AutosaveField } from '@/components/ui/AutosaveField';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Segmented } from '@/components/ui/Segmented';
import { ToggleRow } from '@/components/ui/ToggleRow';
import { Txt } from '@/components/ui/Txt';

// ── ID helper (option IDs only need to be unique within a session) ──────────

function optionId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ── Field kind data ──────────────────────────────────────────────────────────

const KIND_OPTIONS: { label: string; value: FormFieldKind }[] = [
  { label: 'Text',     value: 'text'     },
  { label: 'Email',    value: 'email'    },
  { label: 'Number',   value: 'number'   },
  { label: 'Select',   value: 'select'   },
  { label: 'Checkbox', value: 'checkbox' },
];

// ── OptionList ────────────────────────────────────────────────────────────────

interface OptionListProps {
  options: FormFieldOption[];
  onChange: (options: FormFieldOption[]) => void;
}

function OptionList({ options, onChange }: OptionListProps) {
  const { colors } = useTheme();

  function addOption() {
    onChange([...options, { id: optionId(), label: '' }]);
  }

  function removeOption(id: string) {
    onChange(options.filter((o) => o.id !== id));
  }

  function renameOption(id: string, label: string) {
    onChange(options.map((o) => (o.id === id ? { ...o, label } : o)));
  }

  return (
    <View style={styles.optionSection}>
      <Txt variant="micro" weight="bold" mono uppercase tone="inkFaint" style={styles.optionLabel}>
        Options
      </Txt>
      {options.map((opt) => (
        <View key={opt.id} style={[styles.optionRow, { borderBottomColor: colors.lineFaint }]}>
          <View style={styles.optionInput}>
            <AutosaveField
              initialText={opt.label}
              plain
              placeholder="Option label…"
              onCommit={(text) => renameOption(opt.id, text)}
            />
          </View>
          <IconButton
            name="trash"
            size={16}
            tooltip="Remove option"
            accessibilityLabel="Remove option"
            onPress={() => removeOption(opt.id)}
          />
        </View>
      ))}
      <Button
        label="Add option"
        variant="ghost"
        size="sm"
        iconName="plus"
        onPress={addOption}
      />
    </View>
  );
}

// ── FieldCard ─────────────────────────────────────────────────────────────────

interface FieldCardProps {
  field: FormField;
  index: number;
  total: number;
  onPatch: (patch: Partial<Omit<FormField, 'id'>>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}

function FieldCard({ field, index, total, onPatch, onMoveUp, onMoveDown, onDelete }: FieldCardProps) {
  const { colors } = useTheme();
  const confirm = useConfirm();

  return (
    <View style={[styles.fieldCard, { backgroundColor: colors.paper, borderColor: colors.lineSoft }]}>
      {/* ── Card header: label + reorder + delete ── */}
      <View style={styles.cardHeader}>
        <View style={styles.labelInput}>
          <AutosaveField
            initialText={field.label}
            textVariant="callout"
            plain
            placeholder="Field label…"
            onCommit={(text) => onPatch({ label: text })}
          />
        </View>
        <View style={styles.cardActions}>
          <IconButton
            name="arrow-up"
            size={16}
            tooltip="Move up"
            accessibilityLabel="Move field up"
            onPress={onMoveUp}
            style={index === 0 ? styles.disabled : undefined}
          />
          <IconButton
            name="arrow-down"
            size={16}
            tooltip="Move down"
            accessibilityLabel="Move field down"
            onPress={onMoveDown}
            style={index >= total - 1 ? styles.disabled : undefined}
          />
          <IconButton
            name="trash"
            size={16}
            tooltip="Delete field"
            accessibilityLabel={`Delete ${field.label || 'field'}`}
            onPress={async () => {
              const ok = await confirm({
                title: 'Delete field?',
                message: `"${field.label || 'Untitled field'}" will be removed from the form.`,
                danger: true,
              });
              if (ok) onDelete();
            }}
          />
        </View>
      </View>

      {/* ── Type selector ── */}
      <View style={styles.cardBody}>
        <Txt variant="micro" weight="bold" mono uppercase tone="inkFaint" style={styles.fieldSectionLabel}>
          Type
        </Txt>
        <Segmented
          options={KIND_OPTIONS}
          value={field.kind}
          onChange={(k) => onPatch({ kind: k })}
        />
      </View>

      {/* ── Required toggle ── */}
      <View style={[styles.cardBody, { borderTopColor: colors.lineFaint }]}>
        <ToggleRow
          title="Required"
          detail="This field must be filled in"
          value={field.required}
          onValueChange={(v) => onPatch({ required: v })}
        />
      </View>

      {/* ── Options (select kind only) ── */}
      {field.kind === 'select' && (
        <View style={[styles.cardBody, { borderTopColor: colors.lineFaint }]}>
          <OptionList
            options={field.options}
            onChange={(options) => onPatch({ options })}
          />
        </View>
      )}
    </View>
  );
}

// ── ResponseRow ───────────────────────────────────────────────────────────────

interface ResponseRowProps {
  response: FormResponse;
}

function ResponseRow({ response }: ResponseRowProps) {
  const { colors } = useTheme();
  const fieldCount = Object.keys(response.data).length;
  return (
    <View style={[styles.responseRow, { borderBottomColor: colors.lineFaint }]}>
      <View style={styles.responseMain}>
        <Txt variant="callout" weight="semibold">
          {response.submitter || 'Anonymous'}
        </Txt>
        <Txt variant="caption" tone="inkMuted">
          {relativeTime(response.submittedAt)} · {fieldCount} field{fieldCount !== 1 ? 's' : ''}
        </Txt>
      </View>
    </View>
  );
}

// ── FormView ──────────────────────────────────────────────────────────────────

interface FormViewProps {
  spaceId: string;
  objectId: string;
}

export function FormView({ spaceId, objectId }: FormViewProps) {
  const { colors } = useTheme();
  const form = useForm(spaceId, objectId);

  function addField() {
    form.addField({ kind: 'text', label: '', required: false });
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      {/* ── Fields section ── */}
      <View style={styles.sectionHeader}>
        <Txt variant="subhead" weight="semibold">Fields</Txt>
        <IconButton
          name="plus"
          tooltip="Add field"
          accessibilityLabel="Add field"
          onPress={addField}
        />
      </View>

      {form.fields.length === 0 ? (
        <View style={styles.emptySection}>
          <EmptyState
            iconName="list"
            title="No fields yet"
            subtitle="Tap + to add your first form field."
          />
        </View>
      ) : (
        <View style={styles.fieldList}>
          {form.fields.map((field, i) => (
            <FieldCard
              key={field.id}
              field={field}
              index={i}
              total={form.fields.length}
              onPatch={(patch) => form.patchField(field.id, patch)}
              onMoveUp={() => form.moveField(field.id, i - 1)}
              onMoveDown={() => form.moveField(field.id, i + 1)}
              onDelete={() => form.deleteField(field.id)}
            />
          ))}
          <Button
            label="Add field"
            variant="secondary"
            full
            iconName="plus"
            onPress={addField}
          />
        </View>
      )}

      {/* ── Responses section ── */}
      <View style={[styles.sectionHeader, styles.responsesSectionHeader]}>
        <Txt variant="subhead" weight="semibold">Responses</Txt>
        <Txt variant="caption" tone="inkMuted">{form.responses.length}</Txt>
      </View>

      {form.responses.length === 0 ? (
        <View style={styles.emptySection}>
          <EmptyState
            iconName="check"
            title="No responses yet"
            subtitle="Responses will appear here when submitted."
          />
        </View>
      ) : (
        <View style={[styles.responseSection, { borderColor: colors.lineSoft, backgroundColor: colors.fill }]}>
          {form.responses.map((response) => (
            <ResponseRow key={response.id} response={response} />
          ))}
        </View>
      )}

      <View style={styles.bottomPad} />
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingVertical: spacing.lg, paddingHorizontal: spacing.screenX, gap: spacing.xs },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  responsesSectionHeader: {
    marginTop: spacing.xl,
  },

  // Field cards
  fieldList: {
    gap: spacing.sm,
  },
  fieldCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    gap: spacing.xs,
  },
  labelInput: { flex: 1 },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  disabled: { opacity: 0.3 },
  cardBody: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  fieldSectionLabel: {
    marginBottom: 2,
  },

  // Options
  optionSection: { gap: spacing.xs },
  optionLabel: { marginBottom: 2 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
  },
  optionInput: { flex: 1 },

  // Responses
  emptySection: {
    minHeight: layout.emptySectionMinHeight,
  },
  responseSection: {
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  responseRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  responseMain: { gap: 2 },

  bottomPad: { height: spacing.xxxl },
});
