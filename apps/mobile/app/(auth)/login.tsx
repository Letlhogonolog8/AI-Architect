import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { Body, Button, Caption, Card, Screen, Title } from '@/components/ui';
import { useAuthStore } from '@/stores/auth.store';
import { colors, radii, spacing } from '@/theme/tokens';

/**
 * Driver sign-in.
 *
 * Two deliberate differences from the web console's login:
 *
 *   - **No "remember me".** The session persists in the Keychain by default,
 *     because a driver forced to sign in at the roadside during an incident is
 *     an unacceptable failure mode.
 *   - **The offline notice is prominent.** Sign-in is the one action that
 *     genuinely cannot work offline, and a driver needs to understand that
 *     before they are in a basement garage at 05:00.
 */
export default function LoginScreen() {
  const login = useAuthStore((state) => state.login);
  const error = useAuthStore((state) => state.error);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !submitting;

  const handleSubmit = async (): Promise<void> => {
    if (!canSubmit) return;
    setSubmitting(true);

    try {
      await login(email.trim(), password);
    } catch {
      // The store holds the message; nothing more to do here.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen scroll={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <View style={styles.brand}>
          <View style={styles.mark} />
          <Title>AEGISDRIVE</Title>
          <Caption>Driver Protection</Caption>
        </View>

        <Card>
          <Body tone="primary" style={styles.heading}>
            Sign in
          </Body>
          <Caption>Use the credentials issued by your fleet administrator.</Caption>

          <View style={styles.field}>
            <Caption>Email address</Caption>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="driver@company.com"
              placeholderTextColor={colors.inkTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              keyboardType="email-address"
              inputMode="email"
              style={styles.input}
              accessibilityLabel="Email address"
            />
          </View>

          <View style={styles.field}>
            <Caption>Password</Caption>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••••••"
              placeholderTextColor={colors.inkTertiary}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              style={styles.input}
              accessibilityLabel="Password"
              onSubmitEditing={() => void handleSubmit()}
              returnKeyType="go"
            />
          </View>

          {error ? (
            <View style={styles.error} accessibilityRole="alert">
              <Caption tone="danger">{error}</Caption>
            </View>
          ) : null}

          <Button
            label={submitting ? 'Signing in' : 'Sign in'}
            variant="primary"
            size="lg"
            block
            loading={submitting}
            disabled={!canSubmit}
            onPress={() => void handleSubmit()}
          />
        </Card>

        <Caption style={styles.notice}>
          Signing in needs a connection. Once signed in, the app keeps working offline — your panic
          button, evidence capture and trip tracking do not require signal.
        </Caption>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.md,
    gap: spacing.lg,
  },
  brand: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  mark: {
    width: 56,
    height: 56,
    borderRadius: radii.card,
    backgroundColor: 'rgba(46,139,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(46,139,255,0.5)',
    marginBottom: spacing.sm,
  },
  heading: {
    fontWeight: '700',
    fontSize: 17,
  },
  field: {
    gap: 6,
    marginTop: spacing.sm,
  },
  input: {
    minHeight: 50,
    borderRadius: radii.control,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: spacing.md,
    color: colors.inkPrimary,
    fontSize: 16,
  },
  error: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.control,
    backgroundColor: 'rgba(255,59,92,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,59,92,0.4)',
  },
  notice: {
    textAlign: 'center',
    lineHeight: 18,
  },
});
