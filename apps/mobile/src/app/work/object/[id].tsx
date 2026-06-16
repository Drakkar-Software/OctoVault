import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { layout, spacing } from '@/theme';
import { relativeTime } from '@drakkar.software/octovault-sdk';
import { useRecordVisit } from '@/lib/use-recents';
import { useSpaces } from '@/lib/use-spaces';
import { useSpaceObjects } from '@/lib/space-objects-context';
import { useTheme } from '@/lib/use-theme';
import { useTypeRegistry } from '@/lib/type-registry-context';
import { AppBar } from '@/components/ui/AppBar';
import { Stage } from '@/components/ui/Stage';
import { StackScreen } from '@/components/ui/StackScreen';
import { Txt } from '@/components/ui/Txt';
import { Breadcrumbs } from '@/components/objects/Breadcrumbs';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { ObjectActions } from '@/components/objects/ObjectActions';
import { PageView } from '@/components/work/PageView';
import { BoardView } from '@/components/work/BoardView';
import { FileObjectView } from '@/components/work/FileObjectView';
import { RecordView } from '@/components/work/RecordView';
import { TaskPropsStrip } from '@/components/work/TaskPropsStrip';
import { CalendarView } from '@/components/work/CalendarView';
import { FormView } from '@/components/work/FormView';
import { FeedbackView } from '@/components/work/FeedbackView';

/** Generic object viewer — resolves the editor from the object's type descriptor.
 *  Single route for all object types (page, board, task, file, custom). */
export default function WorkObjectScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { spaces, activeId, setActiveId } = useSpaces();
  const { id, spaceId: spaceParam, emoji, label, task, seed, focusTitle } = useLocalSearchParams<{
    id: string;
    spaceId?: string;
    emoji?: string;
    label?: string;
    task?: string;
    seed?: string;
    focusTitle?: string;
  }>();
  const spaceId = spaceParam || activeId || '';
  useEffect(() => {
    // Only switch the active workspace to a space the user is a member of —
    // cross-space public objects navigated directly must not corrupt the sidebar.
    if (spaceId && spaceId !== activeId && spaces.some((s) => s.id === spaceId)) setActiveId(spaceId);
  }, [spaceId, activeId, setActiveId, spaces]);
  useRecordVisit(spaceId, id);

  const registry = useTypeRegistry();
  const { objects } = useSpaceObjects();
  const { ancestors, get, rename, archive, loaded } = objects;
  const trail = ancestors(id);
  const node = get(id);
  const parent = trail.at(-1);
  const editor = node ? registry.descriptor(node.type).editor : 'page';

  // A cross-space public object: the index is loaded but the node isn't there because
  // it lives in a space the user hasn't joined.  Show an honest notice instead of
  // silently rendering a blank editor.  Once the full public-content renderer lands
  // (the planned follow-up) this guard can be removed or repurposed.
  const isCrossSpacePublic = loaded && !node;
  const [toolbar, setToolbar] = useState<ReactNode>(null);
  // Editors that own their own internal ScrollView — read from the type descriptor so
  // new types are automatically handled without touching this file.
  const selfScrolling = !!(node && registry.descriptor(node.type).ownsScroll);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/work'));
  const openCrumb = (nid: string) =>
    router.push({ pathname: '/work/object/[id]', params: { id: nid, spaceId } });

  const actions = (
    <ObjectActions node={node} onRename={(patch) => rename(id, patch)} onArchive={() => { archive(id); goBack(); }} />
  );

  const content =
    editor === 'record' ? (
      <Stage maxWidth={layout.editorMaxWidth} style={styles.stage}>
        <ErrorBoundary label="Record">
          <RecordView spaceId={spaceId} objectId={id} />
        </ErrorBoundary>
      </Stage>
    ) : editor === 'file' ? (
      <Stage maxWidth={layout.editorMaxWidth} style={styles.stage}>
        <ErrorBoundary label="File">
          <FileObjectView
            spaceId={spaceId}
            objectId={id}
            onRenameTitle={(t) => rename(id, { title: t.trim() || 'Untitled' })}
          />
        </ErrorBoundary>
      </Stage>
    ) : editor === 'board' ? (
      <ErrorBoundary label="Board">
        <BoardView
          spaceId={spaceId}
          objectId={id}
          emoji={node?.emoji || emoji}
          title={node?.title || label}
          onRenameTitle={(t) => rename(id, { title: t.trim() || 'Untitled Board' })}
          onChangeEmoji={(glyph) => rename(id, { emoji: glyph ?? '' })}
          seedDefaults={seed === '1'}
          focusTitle={focusTitle === '1'}
        />
      </ErrorBoundary>
    ) : editor === 'calendar' ? (
      <Stage maxWidth={layout.editorMaxWidth} style={styles.stage}>
        <ErrorBoundary label="Calendar">
          <CalendarView spaceId={spaceId} objectId={id} />
        </ErrorBoundary>
      </Stage>
    ) : editor === 'form' ? (
      <Stage maxWidth={layout.editorMaxWidth} style={styles.stage}>
        <ErrorBoundary label="Form">
          <FormView spaceId={spaceId} objectId={id} />
        </ErrorBoundary>
      </Stage>
    ) : editor === 'feedback' ? (
      <Stage maxWidth={layout.editorMaxWidth} style={styles.stage}>
        <ErrorBoundary label="Feedback">
          <FeedbackView spaceId={spaceId} objectId={id} />
        </ErrorBoundary>
      </Stage>
    ) : (
      <Stage maxWidth={layout.editorMaxWidth} style={styles.stage}>
        {node?.type === 'task' ? (
          <TaskPropsStrip spaceId={spaceId} taskId={id} />
        ) : null}
        <ErrorBoundary label="Page">
          <PageView
            spaceId={spaceId}
            objectId={id}
            emoji={node?.emoji || emoji}
            title={node?.title || label}
            subtitle={node ? `Edited ${relativeTime(node.updatedAt)}` : undefined}
            onRenameTitle={(t) => rename(id, { title: t.trim() || 'Untitled' })}
            onChangeEmoji={(glyph) => rename(id, { emoji: glyph ?? '' })}
            focusTitle={focusTitle === '1'}
            onToolbar={setToolbar}
          />
        </ErrorBoundary>
      </Stage>
    );

  if (isCrossSpacePublic) {
    return (
      <StackScreen
        scroll
        header={
          <AppBar title={label || 'Object'} onBack={goBack} />
        }
      >
        <Stage maxWidth={layout.editorMaxWidth} style={styles.stage}>
          <View style={{ alignItems: 'center', paddingTop: spacing.xxxl, gap: spacing.md }}>
            <Txt variant="body" tone="inkFaint" style={{ textAlign: 'center' }}>
              This public object lives in a space you haven{"'"}t joined — in-app preview is coming soon.
            </Txt>
          </View>
        </Stage>
      </StackScreen>
    );
  }

  return (
    <StackScreen
      scroll={!selfScrolling}
      contentStyle={!selfScrolling ? styles.content : undefined}
      footer={!selfScrolling ? toolbar : undefined}
      header={
        <AppBar
          title={node?.title || label || 'Object'}
          subtitle={parent ? parent.title || 'Untitled' : undefined}
          onBack={goBack}
          right={actions}
        />
      }
      desktopHeader={
        <View style={[styles.topbar, { backgroundColor: colors.paper, borderBottomColor: colors.lineSoft }]}>
          <View style={styles.topbarCrumbs}>
            <Breadcrumbs trail={trail} current={node} onNavigate={(n) => openCrumb(n.id)} />
          </View>
          {actions}
        </View>
      }
    >
      {content}
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.lg, paddingBottom: spacing.xxxl },
  stage: { gap: spacing.sm },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: layout.desktopTopbarHeight,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
  },
  topbarCrumbs: { flex: 1, minWidth: 0 },
});
