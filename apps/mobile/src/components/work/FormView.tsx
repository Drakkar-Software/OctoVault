import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { radii, spacing } from '@/theme';
import { relativeTime } from '@drakkar.software/octovault-sdk';
import { useForm, type FormField, type FormFieldKind, type FormResponse } from '@/lib/use-form';
import { useTheme } from '@/lib/use-theme';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Pill } from '@/components/ui/Pill';
import { Txt } from '@/components/ui/Txt';

interface FormViewProps {
  spaceId: string;
  objectId: string;
}

function kindLabel(kind: FormFieldKind): string {
  switch (kind) {
    case 'text':     return 'Text';
    case 'email':    return 'Email';
    case 'number':   return 'Number';
    case 'select':   return 'Select';
    case 'checkbox': return 'Checkbox';
    default:         return kind;
  }
}

interface FieldRowProps {
  field: FormField;
  onDelete: () => void;
}

function FieldRow({ field, onDelete }: FieldRowProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.itemRow, { borderBottomColor: colors.lineFaint }]}>
      <View style={styles.itemMain}>
        <Txt variant="callout" weight="semibold">
          {field.label || 'Untitled field'}
        </Txt>
        <View style={styles.itemMeta}>
          <Pill label={kindLabel(field.kind)} tone="neutral" />
          {field.required ? <Pill label="Required" tone="accent" /> : null}
        </View>
      </View>
      <IconButton
        name="trash"
        tooltip="Delete field"
        accessibilityLabel={`Delete ${field.label}`}
        onPress={() => {
          Alert.alert('Delete field?', `"${field.label || 'Untitled field'}" will be removed.`, [
            { text: 'Delete', style: 'destructive', onPress: onDelete },
            { text: 'Cancel', style: 'cancel' },
          ]);
        }}
      />
    </View>
  );
}

interface ResponseRowProps {
  response: FormResponse;
}

function ResponseRow({ response }: ResponseRowProps) {
  const { colors } = useTheme();
  const fieldCount = Object.keys(response.data).length;
  return (
    <View style={[styles.itemRow, { borderBottomColor: colors.lineFaint }]}>
      <View style={styles.itemMain}>
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

export function FormView({ spaceId, objectId }: FormViewProps) {
  const { colors } = useTheme();
  const form = useForm(spaceId, objectId);

  function addField() {
    form.addField({ kind: 'text', label: 'New field', required: false });
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.paper }]}
      contentContainerStyle={styles.content}
    >
      {/* Fields section */}
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
            subtitle="Tap + to add a form field."
          />
        </View>
      ) : (
        <View style={[styles.section, { borderColor: colors.lineSoft, backgroundColor: colors.fill }]}>
          {form.fields.map((field) => (
            <FieldRow
              key={field.id}
              field={field}
              onDelete={() => form.deleteField(field.id)}
            />
          ))}
        </View>
      )}

      {/* Responses section */}
      <View style={[styles.sectionHeader, { marginTop: spacing.lg }]}>
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
        <View style={[styles.section, { borderColor: colors.lineSoft, backgroundColor: colors.fill }]}>
          {form.responses.map((response) => (
            <ResponseRow key={response.id} response={response} />
          ))}
        </View>
      )}

      <View style={styles.bottomPad} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.lg },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  section: {
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  emptySection: {
    height: 180,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  itemMain: { flex: 1, gap: 4 },
  itemMeta: { flexDirection: 'row', gap: spacing.xs },
  bottomPad: { height: spacing.xxxl },
});
