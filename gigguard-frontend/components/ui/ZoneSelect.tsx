'use client';

import { getZonesByCity } from '@/lib/zones';

interface ZoneSelectProps {
  city: string;
  value: string;
  onChange: (zone: string) => void;
  onBlur?: () => void;
  error?: string | null;
}

const riskBadgeClass: Record<string, string> = {
  high: 'bg-rose-500/15 text-rose-200 border-rose-500/40',
  medium: 'bg-amber-500/15 text-amber-200 border-amber-500/40',
  low: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/40',
};

export default function ZoneSelect({ city, value, onChange, onBlur, error }: ZoneSelectProps) {
  const zones = city ? getZonesByCity(city) : [];
  const selected = zones.find((zone) => zone.zone === value);

  return (
    <div className="space-y-1.5">
      <label htmlFor="zone" className="text-sm font-medium text-slate-100">
        Zone
      </label>
      <select
        id="zone"
        value={value}
        disabled={!city}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        className={`w-full rounded-xl border bg-slate-900/70 px-3 py-2.5 text-sm outline-none transition ${
          error ? 'border-rose-500/60' : 'border-slate-700 focus:border-amber-400/70'
        } ${!city ? 'cursor-not-allowed opacity-70' : ''}`}
      >
        <option value="">{city ? 'Select zone' : 'Select city first'}</option>
        {zones.map((zone) => (
          <option key={zone.zone_id} value={zone.zone}>
            {zone.zone} ({zone.risk})
          </option>
        ))}
      </select>
      {selected ? (
        <div className="pt-1">
          <span
            className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${riskBadgeClass[selected.risk]}`}
          >
            {selected.risk} risk
          </span>
        </div>
      ) : null}
      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}
