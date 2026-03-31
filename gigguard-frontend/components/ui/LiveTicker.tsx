'use client';

import { DisruptionEventsResponse } from '@/lib/types';

interface LiveTickerProps {
  events: DisruptionEventsResponse['events'];
}

function formatEvent(event: DisruptionEventsResponse['events'][number]): string {
  const value = event.trigger_value == null ? '-' : event.trigger_value;
  return `${event.trigger_type} in ${event.zone}, ${event.city} • ${value} • ${event.affected_worker_count} workers`;
}

export default function LiveTicker({ events }: LiveTickerProps) {
  const hasEvents = events.length > 0;
  const items = hasEvents ? [...events, ...events] : [];

  return (
    <div className="surface-card flex items-center gap-4 overflow-hidden px-4 py-3">
      <div className="inline-flex shrink-0 items-center gap-2 rounded-full border border-red-500/50 bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-200">
        <span className="live-dot" />
        {hasEvents ? 'LIVE' : 'ALL CLEAR'}
      </div>

      {hasEvents ? (
        <div className="min-w-0 overflow-hidden">
          <div className="ticker-track text-sm text-secondary">
            {items.map((event, index) => (
              <span key={`${event.id}_${index}`}>{formatEvent(event)}</span>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-emerald-300">? All zones clear</p>
      )}
    </div>
  );
}

