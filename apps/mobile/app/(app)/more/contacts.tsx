import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, TextInput, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import {
  Body,
  Button,
  Caption,
  Card,
  Divider,
  EmptyState,
  Overline,
  Pill,
  Row,
  Screen,
} from '@/components/ui';
import { ConnectivityBanner } from '@/components/ConnectivityBanner';
import { openDatabase } from '@/db/database';
import type { EmergencyContact } from '@/types';
import { colors, radii, spacing } from '@/theme/tokens';

/**
 * Emergency contacts.
 *
 * Stored **locally first**. These are needed at the exact moment there is no
 * signal, so the device is the source of truth and the server copy is a backup
 * — the opposite of every other list in this app.
 *
 * One-tap dial is the whole point of the screen: a driver who has just been
 * robbed should not be navigating a phone book.
 */

interface ContactRow {
  id: string;
  name: string;
  relationship: string;
  phone_number: string;
  priority: number;
  notify_on_incident: number;
}

export default function ContactsScreen() {
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [phone, setPhone] = useState('');

  const load = useCallback(async (): Promise<void> => {
    const database = await openDatabase();
    const rows = await database.getAllAsync<ContactRow>(
      'SELECT * FROM emergency_contacts ORDER BY priority ASC, name ASC;',
    );

    setContacts(
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        relationship: row.relationship,
        phoneNumber: row.phone_number,
        priority: row.priority,
        notifyOnIncident: row.notify_on_incident === 1,
      })),
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const addContact = async (): Promise<void> => {
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();

    if (trimmedName.length === 0 || trimmedPhone.length === 0) return;

    const database = await openDatabase();
    await database.runAsync(
      `INSERT INTO emergency_contacts (id, name, relationship, phone_number, priority, notify_on_incident)
       VALUES (?, ?, ?, ?, ?, 1);`,
      Crypto.randomUUID(),
      trimmedName,
      relationship.trim() || 'Contact',
      trimmedPhone,
      contacts.length,
    );

    setName('');
    setRelationship('');
    setPhone('');
    setAdding(false);
    await load();
  };

  const removeContact = (contact: EmergencyContact): void => {
    Alert.alert(
      'Remove contact',
      `${contact.name} will no longer be called if you cannot be reached.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const database = await openDatabase();
              await database.runAsync('DELETE FROM emergency_contacts WHERE id = ?;', contact.id);
              await load();
            })();
          },
        },
      ],
    );
  };

  const call = (contact: EmergencyContact): void => {
    void Linking.openURL(`tel:${contact.phoneNumber}`);
  };

  return (
    <Screen>
      <ConnectivityBanner />

      <Card>
        <Overline>How these are used</Overline>
        <Caption>
          If an incident is raised and you cannot be reached, the control room contacts these people
          in order. They are stored on this device so they work with no signal.
        </Caption>
      </Card>

      {contacts.length === 0 ? (
        <Card>
          <EmptyState
            title="No emergency contacts"
            description="Add at least one person who should be called if you cannot be reached."
          />
        </Card>
      ) : (
        contacts.map((contact, index) => (
          <Card key={contact.id}>
            <Row style={styles.between}>
              <View style={styles.contactText}>
                <Body tone="primary" style={styles.name}>
                  {contact.name}
                </Body>
                <Caption>
                  {contact.relationship} · {contact.phoneNumber}
                </Caption>
              </View>
              <Pill
                label={index === 0 ? 'Called first' : `#${index + 1}`}
                tone={index === 0 ? 'accent' : 'neutral'}
              />
            </Row>

            <Divider />

            <Row gap={spacing.sm}>
              <Button
                label="Call"
                variant="primary"
                style={styles.flex}
                onPress={() => call(contact)}
              />
              <Button
                label="Remove"
                variant="ghost"
                style={styles.flex}
                onPress={() => removeContact(contact)}
              />
            </Row>
          </Card>
        ))
      )}

      {adding ? (
        <Card tone="accent">
          <Overline>New contact</Overline>

          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Full name"
            placeholderTextColor={colors.inkTertiary}
            style={styles.input}
            accessibilityLabel="Contact name"
          />
          <TextInput
            value={relationship}
            onChangeText={setRelationship}
            placeholder="Relationship (e.g. spouse, supervisor)"
            placeholderTextColor={colors.inkTertiary}
            style={styles.input}
            accessibilityLabel="Relationship"
          />
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="+27821234567"
            placeholderTextColor={colors.inkTertiary}
            keyboardType="phone-pad"
            inputMode="tel"
            style={styles.input}
            accessibilityLabel="Phone number"
          />

          <Row gap={spacing.sm}>
            <Button
              label="Save"
              variant="primary"
              style={styles.flex}
              disabled={name.trim().length === 0 || phone.trim().length === 0}
              onPress={() => void addContact()}
            />
            <Button
              label="Cancel"
              variant="ghost"
              style={styles.flex}
              onPress={() => setAdding(false)}
            />
          </Row>
        </Card>
      ) : (
        <Button label="Add contact" variant="secondary" block onPress={() => setAdding(true)} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  between: { justifyContent: 'space-between' },
  contactText: { flex: 1, gap: 2 },
  name: { fontWeight: '600', fontSize: 16 },
  flex: { flex: 1 },
  input: {
    minHeight: 48,
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: spacing.md,
    color: colors.inkPrimary,
    fontSize: 15,
  },
});
