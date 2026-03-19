'use client';

import Link from 'next/link';
import { ShoppingCart, RadioTower, Zap, Banknote, ShieldCheck, TowerControl, Footprints, GitBranch, User, Shield } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

const triggerData = [
  { trigger: 'Heavy Rainfall', source: 'OpenWeatherMap', threshold: '> 15 mm/hr', payout: '₹320 (4 hrs)' },
  { trigger: 'Severe AQI', source: 'AQICN', threshold: '> 300 PM2.5', payout: '₹400 (5 hrs)' },
  { trigger: 'Extreme Heat', source: 'OpenWeatherMap', threshold: '> 44°C feels like', payout: '₹320 (4 hrs)' },
  { trigger: 'Flood / Red Alert', source: 'IMD Alert', threshold: 'Alert Active', payout: '₹640 (8 hrs)' },
  { trigger: 'Curfew / Strike', source: 'Verified Source', threshold: 'Event Active', payout: '₹640 (8 hrs)' },
];

const personas = [
    { name: 'Ramesh Kumar', city: 'Delhi', zone: 'Connaught Place', premium: 46, quote: 'Covered for heatwaves and AQI spikes' },
    { name: 'Sameer Shaikh', city: 'Mumbai', zone: 'Andheri West', premium: 64, quote: 'Covered during monsoon and floods' },
    { name: 'Priya Murthy', city: 'Chennai', zone: 'T. Nagar', premium: 33, quote: 'Lowest risk zone, lowest premium' },
];

const trustBadges = [
    { icon: TowerControl, title: 'Cell Tower Verification' },
    { icon: Footprints, title: 'Behavioral Coherence Score' },
    { icon: GitBranch, title: 'Geospatial Trajectory Check' },
    { icon: ShieldCheck, title: 'Graph Neural Network Fraud Ring Detection' },
]

export default function LandingPage() {
  const { login } = useAuth();

  return (
    <div className="space-y-24">
      {/* Hero Section */}
      <section className="text-center">
        <h1 className="text-5xl font-extrabold tracking-tight text-slate-900 sm:text-6xl md:text-7xl">
          Your income, <span className="text-sky-500">protected.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
          Zero-touch parametric insurance for Zomato & Swiggy delivery partners. When the rain stops your work, we start your payout — automatically.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <button
            onClick={() => login('worker')}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-500 px-6 py-3 text-base font-semibold text-white shadow-md hover:bg-sky-600 sm:w-auto"
          >
            <User className="h-5 w-5" />
            Login as Worker
          </button>
          <button
            onClick={() => login('insurer')}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-white px-6 py-3 text-base font-semibold text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-100 sm:w-auto"
          >
            <Shield className="h-5 w-5" />
            Login as Insurer
          </button>
        </div>
        <div className="mt-12">
            <div className="inline-flex animate-pulse items-center space-x-3 rounded-full bg-amber-100 p-2 pr-4 text-amber-900">
                <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
                <p className="text-sm font-semibold">
                    <span className="font-bold">LIVE EVENT:</span> Heavy Rainfall detected in Andheri West, Mumbai — 142 workers receiving payouts now
                </p>
            </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="scroll-mt-20">
        <div className="text-center">
            <h2 className="text-4xl font-bold tracking-tight text-slate-900">Simple, Transparent, and Fast</h2>
            <p className="mt-2 text-lg text-slate-600">Four steps to peace of mind.</p>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-4">
            <div className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sky-100 text-sky-600">
                    <ShoppingCart className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">1. Buy</h3>
                <p className="mt-1 text-slate-600">Purchase a weekly policy in under 2 minutes. From ₹33/week.</p>
            </div>
            <div className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sky-100 text-sky-600">
                    <RadioTower className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">2. Monitor</h3>
                <p className="mt-1 text-slate-600">Our engine watches weather & AQI for your zone 24/7.</p>
            </div>
            <div className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sky-100 text-sky-600">
                    <Zap className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">3. Trigger</h3>
                <p className="mt-1 text-slate-600">When rainfall > 15mm/hr or AQI > 300, we auto-detect.</p>
            </div>
            <div className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                    <Banknote className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">4. Payout</h3>
                <p className="mt-1 text-slate-600">Money in your UPI in under 30 minutes. No forms.</p>
            </div>
        </div>
      </section>

      {/* Trigger Table Section */}
      <section>
        <div className="text-center">
            <h2 className="text-4xl font-bold tracking-tight text-slate-900">What We Cover</h2>
            <p className="mt-2 text-lg text-slate-600">Automatic payouts for income disruptions you can't control.</p>
        </div>
        <div className="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Trigger</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Data Source</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Threshold</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Payout (₹800/day worker)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {triggerData.map((item, index) => (
                <tr key={index} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-slate-900">{item.trigger}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">{item.source}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600 font-mono">{item.threshold}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-emerald-600">{item.payout}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Personas Section */}
      <section>
        <div className="text-center">
            <h2 className="text-4xl font-bold tracking-tight text-slate-900">Built for Workers Like You</h2>
            <p className="mt-2 text-lg text-slate-600">Premiums are tailored to your location's specific risk level.</p>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
            {personas.map((persona) => (
                <div key={persona.name} className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm transition-shadow hover:shadow-md">
                    <img src={`https://api.dicebear.com/8.x/pixel-art/svg?seed=${persona.name.split(' ')[0]}`} alt={persona.name} className="mx-auto h-16 w-16 rounded-full" />
                    <h3 className="mt-4 text-lg font-semibold text-slate-900">{persona.name}</h3>
                    <p className="text-sm text-slate-500">{persona.zone}, {persona.city}</p>
                    <p className="mt-2 text-sm text-slate-600 italic">"{persona.quote}"</p>
                    <div className="mt-4">
                        <span className="inline-block rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-800">
                            ₹{persona.premium}/week
                        </span>
                    </div>
                </div>
            ))}
        </div>
      </section>
      
      {/* Anti-Spoofing Section */}
      <section>
        <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-4xl font-bold tracking-tight text-slate-900">🛡️ Protected by Multi-Layer Anti-Spoofing AI</h2>
            <p className="mt-2 text-lg text-slate-600">Our advanced system ensures claims are legitimate, keeping premiums low for everyone.</p>
        </div>
        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {trustBadges.map((badge) => (
                <div key={badge.title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-4">
                        <div className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                           <badge.icon className="h-6 w-6" />
                        </div>
                        <h3 className="text-md font-semibold text-slate-800">{badge.title}</h3>
                    </div>
                </div>
            ))}
        </div>
      </section>

    </div>
  );
}
