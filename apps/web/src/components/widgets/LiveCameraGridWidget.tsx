import { useMemo, useState } from 'react';
import { CameraOff, Video, VideoOff } from 'lucide-react';
import { CameraStatus, type CameraDetection, type CameraFeed } from '@aegisdrive/types';
import { Badge, cn } from '@aegisdrive/ui';
import { relativeTime } from '@aegisdrive/shared';
import { useCameraFeeds } from '@/features/command-centre/command-centre.queries';
import { useCommandCentreStore } from '@/stores/command-centre.store';
import { Widget } from './Widget';

/**
 * Live camera grid.
 *
 * Renders every monitored feed with its vision-model detections overlaid.
 *
 * **On the absent video.** `streamUrl` is null in the simulation, and the tile
 * renders an explicit "no signal" state rather than a placeholder image or a
 * looping stock clip. A camera tile showing convincing-looking footage that is
 * not the vehicle's actual feed is the single most dangerous thing this
 * dashboard could do: an operator would clear a vehicle based on it. When a
 * real HLS URL arrives, the `<video>` element goes where the placeholder is and
 * the detection overlay already works unchanged.
 */
export function LiveCameraGridWidget() {
  const query = useCameraFeeds();
  const liveCameras = useCommandCentreStore((state) => state.cameras);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const feeds = useMemo(() => {
    const merged = (query.data ?? []).map((feed) => {
      const live = liveCameras[feed.id];
      if (!live) return feed;

      return {
        ...feed,
        status: live.status,
        detections: live.detections,
        lastFrameAt: live.lastFrameAt,
      };
    });

    // Feeds with a critical detection first, then live, then everything dark.
    return [...merged].sort((a, b) => rank(a) - rank(b));
  }, [query.data, liveCameras]);

  const offline = feeds.filter((feed) => feed.status === CameraStatus.OFFLINE).length;
  const criticalCount = feeds.filter((feed) =>
    feed.detections.some((detection) => detection.isCritical),
  ).length;

  return (
    <Widget
      title="Live camera grid"
      subtitle={`${feeds.length - offline} of ${feeds.length} feeds online`}
      live={feeds.length > offline}
      alarm={criticalCount > 0}
      isLoading={query.isLoading}
      error={query.error}
      isEmpty={feeds.length === 0}
      emptyTitle="No camera feeds"
      emptyDescription="Feeds appear once in-vehicle cameras are provisioned."
      onRetry={() => void query.refetch()}
      className="h-full"
      actions={
        <div className="flex items-center gap-1.5">
          {criticalCount > 0 ? <Badge tone="danger">{criticalCount} flagged</Badge> : null}
          {offline > 0 ? <Badge tone="neutral">{offline} offline</Badge> : null}
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 2xl:grid-cols-4">
        {feeds.map((feed) => (
          <CameraTile
            key={feed.id}
            feed={feed}
            focused={focusedId === feed.id}
            onToggleFocus={() => setFocusedId((current) => (current === feed.id ? null : feed.id))}
          />
        ))}
      </div>
    </Widget>
  );
}

function rank(feed: CameraFeed): number {
  if (feed.detections.some((detection) => detection.isCritical)) return 0;
  if (feed.status === CameraStatus.RECORDING) return 1;
  if (feed.status === CameraStatus.LIVE) return 2;
  if (feed.status === CameraStatus.DEGRADED) return 3;
  return 4;
}

const STATUS_STYLE: Record<
  CameraStatus,
  { tone: 'live' | 'danger' | 'warning' | 'neutral'; label: string }
> = {
  LIVE: { tone: 'live', label: 'Live' },
  RECORDING: { tone: 'danger', label: 'Recording' },
  DEGRADED: { tone: 'warning', label: 'Degraded' },
  OFFLINE: { tone: 'neutral', label: 'No signal' },
};

function CameraTile({
  feed,
  focused,
  onToggleFocus,
}: {
  feed: CameraFeed;
  focused: boolean;
  onToggleFocus: () => void;
}) {
  const offline = feed.status === CameraStatus.OFFLINE;
  const critical = feed.detections.some((detection) => detection.isCritical);
  const style = STATUS_STYLE[feed.status];

  return (
    <button
      type="button"
      onClick={onToggleFocus}
      aria-pressed={focused}
      aria-label={`${feed.label}, ${style.label}, ${feed.detections.length} detections`}
      className={cn(
        'group relative aspect-video overflow-hidden rounded-control border text-left transition-all',
        critical
          ? 'border-signal-critical/50 shadow-alarm'
          : focused
            ? 'border-aegis-400/60'
            : 'border-hairline hover:border-hairline-strong',
      )}
    >
      {/* Video surface. Deliberately not a fake image — see the file comment. */}
      <div
        className={cn(
          'absolute inset-0 grid place-items-center',
          offline ? 'bg-abyss' : 'bg-gradient-to-br from-surface to-void',
        )}
      >
        {offline ? (
          <div className="flex flex-col items-center gap-1 text-ink-tertiary">
            <VideoOff className="size-5" aria-hidden />
            <span className="text-[9px] font-medium uppercase tracking-widest">No signal</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 text-ink-tertiary/50">
            <Video className="size-5" aria-hidden />
            <span className="text-[9px] font-medium uppercase tracking-widest">Stream pending</span>
          </div>
        )}
      </div>

      {/* Detection overlay. Renders in the same normalised space a real frame
          would, so it needs no change once video is wired in. */}
      {!offline ? (
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full"
          aria-hidden
        >
          {feed.detections.map((detection) =>
            detection.boundingBox ? (
              <DetectionBox key={detection.id} detection={detection} />
            ) : null,
          )}
        </svg>
      ) : null}

      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-1 p-1.5">
        <Badge tone={style.tone} className="scale-90 origin-top-left">
          {style.label}
        </Badge>
        {feed.aiAnalysisEnabled ? (
          <span
            className="rounded bg-black/50 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-hologram backdrop-blur-sm"
            title="Vision model analysing this feed"
          >
            AI
          </span>
        ) : null}
      </div>

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-1.5">
        <p className="truncate text-[10px] font-medium text-ink-primary">{feed.label}</p>
        <p className="flex items-center gap-1 text-[9px] text-ink-tertiary">
          {offline ? (
            <>
              <CameraOff className="size-2.5" aria-hidden />
              Last frame {feed.lastFrameAt ? relativeTime(feed.lastFrameAt) : 'unknown'}
            </>
          ) : (
            <>
              <span data-numeric>{feed.resolution}</span>
              <span aria-hidden>·</span>
              <span data-numeric>{feed.framesPerSecond} fps</span>
              {feed.detections.length > 0 ? (
                <>
                  <span aria-hidden>·</span>
                  <span data-numeric>{feed.detections.length} objects</span>
                </>
              ) : null}
            </>
          )}
        </p>
      </div>
    </button>
  );
}

function DetectionBox({ detection }: { detection: CameraDetection }) {
  if (!detection.boundingBox) return null;

  const [x, y, width, height] = detection.boundingBox;
  const colour = detection.isCritical ? 'var(--color-signal-critical)' : 'var(--color-hologram)';

  return (
    <g>
      <rect
        x={x * 100}
        y={y * 100}
        width={width * 100}
        height={height * 100}
        fill="none"
        stroke={colour}
        strokeWidth={detection.isCritical ? 1.2 : 0.6}
        vectorEffect="non-scaling-stroke"
      />
      <text x={x * 100 + 1} y={y * 100 - 1.5} fill={colour} fontSize={4} className="font-mono">
        {detection.label} {(detection.confidence * 100).toFixed(0)}%
      </text>
    </g>
  );
}
