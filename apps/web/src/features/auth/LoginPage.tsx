import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock, Mail, ShieldCheck } from 'lucide-react';
import { Button, Field, Input, Surface } from '@aegisdrive/ui';
import { APP_NAME, APP_TAGLINE } from '@aegisdrive/shared';
import { ApiError } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';
import { routes } from '@/config/routes';

interface LocationState {
  from?: string;
}

export function LoginPage() {
  const login = useAuthStore((state) => state.login);
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login(email, password);
      // Return the operator to whatever they were trying to reach, which the
      // auth guard stashed before redirecting here.
      const destination = (location.state as LocationState | null)?.from ?? routes.dashboard;
      navigate(destination, { replace: true });
    } catch (caught) {
      // The API deliberately returns one message for every credential failure.
      // Surfacing it verbatim keeps the client from inventing a more specific
      // one and re-introducing account enumeration.
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not reach the authentication service. Check your connection.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center grid-backdrop px-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md"
      >
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <span className="grid size-14 place-items-center rounded-panel bg-aegis-500/15 text-aegis-300 shadow-glow">
            <ShieldCheck className="size-7" aria-hidden />
          </span>
          <div>
            <h1 className="text-title font-semibold tracking-tight text-ink-primary">{APP_NAME}</h1>
            <p className="mt-1 text-xs uppercase tracking-[0.2em] text-ink-tertiary">
              {APP_TAGLINE}
            </p>
          </div>
        </div>

        <Surface elevation="raised" padding="lg" holo>
          <form onSubmit={(event) => void handleSubmit(event)} className="space-y-5" noValidate>
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-ink-primary">Sign in to the console</h2>
              <p className="text-xs text-ink-tertiary">
                Access is logged. Use your assigned operator credentials.
              </p>
            </div>

            <Field label="Email address" required>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  type="email"
                  name="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="operator@organisation.com"
                  leadingIcon={<Mail className="size-4" aria-hidden />}
                />
              )}
            </Field>

            <Field label="Password" required>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••••••"
                  leadingIcon={<Lock className="size-4" aria-hidden />}
                />
              )}
            </Field>

            {error && (
              <p
                role="alert"
                className="rounded-control border border-signal-critical/30 bg-signal-critical/10 px-3 py-2 text-xs text-signal-critical"
              >
                {error}
              </p>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              block
              loading={isSubmitting}
              disabled={email.length === 0 || password.length === 0}
            >
              {isSubmitting ? 'Authenticating' : 'Sign in'}
            </Button>
          </form>
        </Surface>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-ink-tertiary">
          Unauthorised access to this system is an offence. All sessions, queries and evidence
          access are recorded in an immutable audit trail.
        </p>
      </motion.div>
    </div>
  );
}
