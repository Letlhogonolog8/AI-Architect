import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { EmptyState, Surface, buttonVariants } from '@aegisdrive/ui';
import { routes } from '@/config/routes';

export function NotFoundPage() {
  return (
    <div className="grid min-h-dvh place-items-center grid-backdrop px-4">
      <Surface elevation="raised" padding="lg" holo className="w-full max-w-md">
        <EmptyState
          size="full"
          icon={<Compass className="size-5" aria-hidden />}
          title="This screen does not exist"
          description="The link may be out of date, or the page may have moved in a recent release."
          action={
            // A link, styled as a button. Nesting an anchor inside a <button>
            // would be invalid markup and breaks keyboard activation.
            <Link
              to={routes.dashboard}
              className={buttonVariants({ variant: 'primary', size: 'sm' })}
            >
              Back to the dashboard
            </Link>
          }
        />
      </Surface>
    </div>
  );
}
