import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Body, Caption, EmptyState, Overline, Pill, Row, Title } from '@/components/ui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ConnectivityBanner } from '@/components/ConnectivityBanner';
import { QUICK_REPLIES, useMessagingStore } from '@/stores/messaging.store';
import { useSosStore } from '@/stores/sos.store';
import type { SecureMessage } from '@/types';
import { colors, radii, spacing } from '@/theme/tokens';

/**
 * Secure messaging with the control room.
 *
 * Two things make this different from a normal chat:
 *
 *   1. **Quick replies come first.** A driver under duress cannot type. The
 *      covert ones — "cannot talk", "being followed", "under duress" — send with
 *      no confirmation dialog and no visible change beyond the message
 *      appearing, so a glance over the shoulder reveals nothing.
 *   2. **Pending messages are marked, not hidden.** An outbound message that has
 *      not reached the server yet says so. A driver must never believe the
 *      control room has read something it has not received.
 */
export default function MessagesScreen() {
  const { messages, load, send, sendQuickReply, markAllRead } = useMessagingStore();
  const activation = useSosStore((state) => state.activation);
  const [draft, setDraft] = useState('');
  const listRef = useRef<FlatList<SecureMessage>>(null);

  const incidentId = activation?.id ?? null;

  useEffect(() => {
    void load();
    void markAllRead();
  }, [load, markAllRead]);

  const handleSend = (): void => {
    const body = draft.trim();
    if (body.length === 0) return;

    setDraft('');
    void send(body, incidentId);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        <View style={styles.header}>
          <ConnectivityBanner />
          <Row style={styles.between}>
            <View>
              <Overline>Control room</Overline>
              <Title>Secure messages</Title>
            </View>
            {incidentId ? <Pill label="Incident open" tone="danger" dot /> : null}
          </Row>
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          // Newest at the bottom visually, achieved by inverting rather than
          // scrolling: inverted lists stay pinned when a message arrives, which
          // scroll-to-end does not once the driver has scrolled up.
          inverted
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => <MessageBubble message={item} />}
          ListEmptyComponent={
            <View style={styles.emptyWrapper}>
              <EmptyState
                title="No messages"
                description="The control room will reach you here during an incident. Replies work offline and send automatically."
              />
            </View>
          }
        />

        <View style={styles.composer}>
          <Overline>Quick replies</Overline>
          <View style={styles.quickReplies}>
            {QUICK_REPLIES.map((reply) => (
              <Pressable
                key={reply.id}
                onPress={() => void sendQuickReply(reply, incidentId)}
                accessibilityRole="button"
                accessibilityLabel={`Send: ${reply.body}`}
                style={({ pressed }) => [
                  styles.quickReply,
                  reply.covert && styles.quickReplyCovert,
                  pressed && styles.pressed,
                ]}
              >
                <Caption tone={reply.covert ? 'danger' : 'secondary'}>{reply.label}</Caption>
              </Pressable>
            ))}
          </View>

          <Row gap={spacing.sm}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Message the control room"
              placeholderTextColor={colors.inkTertiary}
              style={styles.input}
              multiline
              maxLength={500}
              accessibilityLabel="Message text"
            />
            <Pressable
              onPress={handleSend}
              disabled={draft.trim().length === 0}
              accessibilityRole="button"
              accessibilityLabel="Send message"
              style={({ pressed }) => [
                styles.send,
                draft.trim().length === 0 && styles.sendDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Body tone="primary" style={styles.sendGlyph}>
                ➤
              </Body>
            </Pressable>
          </Row>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MessageBubble({ message }: { message: SecureMessage }) {
  const outbound = message.direction === 'OUTBOUND';

  return (
    <View style={[styles.bubbleRow, outbound ? styles.bubbleRowOut : styles.bubbleRowIn]}>
      <View style={[styles.bubble, outbound ? styles.bubbleOut : styles.bubbleIn]}>
        {!outbound && message.senderName ? (
          <Caption tone="accent">{message.senderName}</Caption>
        ) : null}

        <Body tone="primary" style={styles.bubbleText}>
          {message.body}
        </Body>

        <Row gap={6} style={styles.bubbleMeta}>
          <Caption>
            {new Date(message.sentAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Caption>
          {outbound ? (
            <Caption tone={message.pendingSync ? 'warning' : 'success'}>
              {message.pendingSync ? 'Queued' : 'Sent'}
            </Caption>
          ) : null}
        </Row>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.void },
  flex: { flex: 1 },
  header: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  between: { justifyContent: 'space-between', alignItems: 'flex-start' },
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  emptyWrapper: {
    // The list is inverted, so its empty state would render upside down.
    transform: [{ scaleY: -1 }],
    paddingTop: spacing.xl,
  },
  bubbleRow: {
    flexDirection: 'row',
    // Counteracts the inverted list so text reads normally.
    transform: [{ scaleY: -1 }],
  },
  bubbleRowIn: { justifyContent: 'flex-start' },
  bubbleRowOut: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '84%',
    borderRadius: radii.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bubbleIn: {
    backgroundColor: colors.surface,
    borderColor: 'rgba(255,255,255,0.10)',
    borderTopLeftRadius: 4,
  },
  bubbleOut: {
    backgroundColor: 'rgba(46,139,255,0.16)',
    borderColor: 'rgba(46,139,255,0.35)',
    borderTopRightRadius: 4,
  },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  bubbleMeta: { justifyContent: 'flex-end' },
  composer: {
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: colors.abyss,
  },
  quickReplies: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  quickReply: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    minHeight: 36,
    justifyContent: 'center',
  },
  quickReplyCovert: {
    backgroundColor: 'rgba(255,59,92,0.12)',
    borderColor: 'rgba(255,59,92,0.4)',
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: spacing.md,
    paddingTop: 12,
    color: colors.inkPrimary,
    fontSize: 15,
  },
  send: {
    width: 48,
    height: 48,
    borderRadius: radii.control,
    backgroundColor: colors.aegis500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.4 },
  sendGlyph: { fontSize: 18 },
  pressed: { opacity: 0.8 },
});
