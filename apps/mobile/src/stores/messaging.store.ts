import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
import type { QuickReply, SecureMessage } from '@/types';
import { openDatabase } from '@/db/database';
import { enqueue } from '@/db/outbox';

/**
 * Secure operator ↔ driver messaging.
 *
 * Every message is written to SQLite first and rendered from there, so the
 * thread is fully readable with no signal and outbound messages appear
 * instantly with a pending marker. The alternative — an optimistic in-memory
 * list — loses the driver's message if the app is killed before it uploads.
 *
 * "Secure" here means transport security plus the audit trail on the API: the
 * thread is an incident timeline entry, which is append-only and admissible.
 * End-to-end encryption is deliberately **not** claimed — the control room must
 * be able to read these, and a system that hid them from the operator would
 * defeat the product.
 */

interface MessageRow {
  id: string;
  incident_id: string | null;
  direction: string;
  body: string;
  sent_at: number;
  read_at: number | null;
  sender_name: string | null;
  pending_sync: number;
}

/**
 * Canned replies.
 *
 * A driver under duress cannot type. Every one of these is answerable with a
 * single tap, and the covert ones send with no visible confirmation at all.
 */
export const QUICK_REPLIES: readonly QuickReply[] = [
  { id: 'safe', label: "I'm safe", body: 'I am safe. No assistance needed.', covert: false },
  {
    id: 'delayed',
    label: 'Delayed, all fine',
    body: 'Running late but everything is fine.',
    covert: false,
  },
  {
    id: 'cannot-talk',
    label: 'Cannot talk',
    body: 'I cannot speak freely right now.',
    covert: true,
  },
  {
    id: 'followed',
    label: 'Being followed',
    body: 'I believe I am being followed.',
    covert: true,
  },
  {
    id: 'under-duress',
    label: 'Under duress',
    body: 'I am under duress. Do not call me.',
    covert: true,
  },
];

interface MessagingState {
  messages: SecureMessage[];
  unreadCount: number;
  isLoading: boolean;

  load: () => Promise<void>;
  send: (body: string, incidentId: string | null) => Promise<void>;
  sendQuickReply: (reply: QuickReply, incidentId: string | null) => Promise<void>;
  receive: (message: SecureMessage) => Promise<void>;
  markAllRead: () => Promise<void>;
}

function toMessage(row: MessageRow): SecureMessage {
  return {
    id: row.id,
    incidentId: row.incident_id,
    direction: row.direction as SecureMessage['direction'],
    body: row.body,
    sentAt: new Date(row.sent_at).toISOString(),
    readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
    senderName: row.sender_name,
    pendingSync: row.pending_sync === 1,
  };
}

export const useMessagingStore = create<MessagingState>((set, get) => ({
  messages: [],
  unreadCount: 0,
  isLoading: false,

  load: async () => {
    set({ isLoading: true });

    const database = await openDatabase();
    const rows = await database.getAllAsync<MessageRow>(
      'SELECT * FROM messages ORDER BY sent_at DESC LIMIT 200;',
    );

    const messages = rows.map(toMessage);

    set({
      messages,
      unreadCount: messages.filter((m) => m.direction === 'INBOUND' && m.readAt === null).length,
      isLoading: false,
    });
  },

  send: async (body, incidentId) => {
    const trimmed = body.trim();
    if (trimmed.length === 0) return;

    const id = Crypto.randomUUID();
    const sentAt = Date.now();

    const database = await openDatabase();
    await database.runAsync(
      `INSERT INTO messages (id, incident_id, direction, body, sent_at, read_at, sender_name, pending_sync)
       VALUES (?, ?, 'OUTBOUND', ?, ?, NULL, NULL, 1);`,
      id,
      incidentId,
      trimmed,
      sentAt,
    );

    // Optimistic insert into the visible thread, marked pending. The driver
    // sees their message immediately and can tell it has not yet been delivered.
    set((state) => ({
      messages: [
        {
          id,
          incidentId,
          direction: 'OUTBOUND',
          body: trimmed,
          sentAt: new Date(sentAt).toISOString(),
          readAt: null,
          senderName: null,
          pendingSync: true,
        },
        ...state.messages,
      ],
    }));

    await enqueue('MESSAGE_SEND', { incidentId, body: trimmed }, { id });
  },

  sendQuickReply: async (reply, incidentId) => {
    await get().send(reply.body, incidentId);
  },

  receive: async (message) => {
    const database = await openDatabase();

    await database.runAsync(
      `INSERT OR REPLACE INTO messages
         (id, incident_id, direction, body, sent_at, read_at, sender_name, pending_sync)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0);`,
      message.id,
      message.incidentId,
      message.direction,
      message.body,
      Date.parse(message.sentAt),
      message.readAt ? Date.parse(message.readAt) : null,
      message.senderName,
    );

    set((state) => ({
      messages: [message, ...state.messages.filter((m) => m.id !== message.id)],
      unreadCount:
        message.direction === 'INBOUND' && message.readAt === null
          ? state.unreadCount + 1
          : state.unreadCount,
    }));
  },

  markAllRead: async () => {
    const readAt = Date.now();
    const database = await openDatabase();

    await database.runAsync(
      "UPDATE messages SET read_at = ? WHERE direction = 'INBOUND' AND read_at IS NULL;",
      readAt,
    );

    set((state) => ({
      messages: state.messages.map((message) =>
        message.direction === 'INBOUND' && message.readAt === null
          ? { ...message, readAt: new Date(readAt).toISOString() }
          : message,
      ),
      unreadCount: 0,
    }));
  },
}));
