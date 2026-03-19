// app/buy-policy/page.tsx
'use client';

import { useState } from 'react';
import { PREMIUM_QUOTE } from '@/lib/mockData';
import { User, FileText, CheckCircle, MapPin, Briefcase, IndianRupee, BarChart, Zap, HelpCircle } from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import { motion, AnimatePresence } from 'framer-motion';

const StepIndicator = ({ currentStep }: { currentStep: number }) => {
    const steps = ["Your Details", "Your Quote", "Confirmation"];
    return (
        <ol className="flex w-full items-center">
            {steps.map((step, index) => (
                <li key={step} className={`flex w-full items-center ${index < steps.length - 1 ? "after:content-[''] after:w-full after:h-1 after:border-b after:border-slate-300 after:border-4 after:inline-block" : ""} ${index <= currentStep ? 'text-sky-600 after:border-sky-300' : 'text-slate-500'}`}>
                    <span className={`flex items-center justify-center w-10 h-10 rounded-full lg:h-12 lg:w-12 shrink-0 ${index <= currentStep ? 'bg-sky-100' : 'bg-slate-100'}`}>
                        {index === 0 && <User />}
                        {index === 1 && <FileText />}
                        {index === 2 && <CheckCircle />}
                    </span>
                </li>
            ))}
        </ol>
    );
};

const Step1 = ({ onNext }: { onNext: () => void }) => (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
        <h2 className="text-2xl font-bold text-slate-900">Confirm Your Details</h2>
        <p className="text-slate-600 mt-1">Please verify your information to generate a personalized quote.</p>
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-4">
                <img src={`https://api.dicebear.com/8.x/pixel-art/svg?seed=Priya`} alt="Priya Murthy" className="h-16 w-16 rounded-full" />
                <div>
                    <h3 className="text-xl font-bold text-slate-900">{PREMIUM_QUOTE.workerName}</h3>
                    <p className="text-slate-500">Delivery Partner</p>
                </div>
            </div>
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
                    <MapPin className="h-5 w-5 text-slate-500" />
                    <div>
                        <p className="text-xs text-slate-500">Zone</p>
                        <p className="font-semibold text-slate-800">{PREMIUM_QUOTE.zone}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
                    <Briefcase className="h-5 w-5 text-slate-500" />
                    <div>
                        <p className="text-xs text-slate-500">Platform</p>
                        <p className="font-semibold text-slate-800">Zomato</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
                    <IndianRupee className="h-5 w-5 text-slate-500" />
                    <div>
                        <p className="text-xs text-slate-500">Avg. Daily Earning</p>
                        <p className="font-semibold text-slate-800">₹{PREMIUM_QUOTE.avgDailyEarning}</p>
                    </div>
                </div>
            </div>
        </div>
        <button onClick={onNext} className="mt-8 w-full rounded-lg bg-sky-500 px-6 py-3 text-base font-semibold text-white shadow-md hover:bg-sky-600">
            Calculate My Premium →
        </button>
    </motion.div>
);

const Step2 = ({ onNext }: { onNext: () => void }) => (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
        <h2 className="text-2xl font-bold text-slate-900">Your Quote is Ready!</h2>
        <p className="text-slate-600 mt-1">Here is your personalized premium, calculated by our AI model.</p>
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border-2 border-sky-500 bg-white p-6 shadow-lg">
                <p className="text-sm font-semibold text-sky-700">Your Weekly Premium</p>
                <p className="mt-2 text-6xl font-extrabold text-slate-900">
                    ₹{PREMIUM_QUOTE.displayPremium}
                    <span className="text-lg font-medium text-slate-500">/ week</span>
                </p>
                <p className="mt-4 text-sm text-slate-600">This protects up to <span className="font-bold">₹{PREMIUM_QUOTE.maxWeeklyCoverage}</span> of your income from disruptions.</p>
                
                <div className="mt-6 rounded-lg bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-800 flex items-center gap-2"><BarChart className="h-4 w-4" /> AI Premium Calculation</p>
                    <table className="mt-2 w-full text-sm">
                        <tbody>
                            <tr><td className="py-1 text-slate-600">Base Rate</td><td className="py-1 text-right font-mono">₹{PREMIUM_QUOTE.baseRate.toFixed(2)}</td></tr>
                            <tr><td className="py-1 text-slate-600">Zone Multiplier (T. Nagar)</td><td className="py-1 text-right font-mono">x {PREMIUM_QUOTE.zoneMultiplier.toFixed(2)}</td></tr>
                            <tr><td className="py-1 text-slate-600">Weather Multiplier (Clear)</td><td className="py-1 text-right font-mono">x {PREMIUM_QUOTE.weatherMultiplier.toFixed(2)}</td></tr>
                            <tr className="border-b border-slate-200"><td className="py-1 text-slate-600">History Multiplier (🏆)</td><td className="py-1 text-right font-mono">x {PREMIUM_QUOTE.historyMultiplier.toFixed(2)}</td></tr>
                            <tr><td className="pt-2 font-bold text-slate-800">Final Premium</td><td className="pt-2 text-right font-bold font-mono text-slate-800">₹{PREMIUM_QUOTE.weeklyPremium.toFixed(2)}</td></tr>
                        </tbody>
                    </table>
                </div>

                <button onClick={onNext} className="mt-6 w-full rounded-lg bg-emerald-500 px-6 py-3 text-base font-semibold text-white shadow-md hover:bg-emerald-600">
                    Pay ₹{PREMIUM_QUOTE.displayPremium} via UPI →
                </button>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2"><Zap className="h-5 w-5 text-sky-500" /> Your Coverage</h3>
                <p className="text-sm text-slate-600 mt-1">If a trigger event occurs in your zone, you get paid automatically.</p>
                <div className="mt-4 space-y-2">
                    {PREMIUM_QUOTE.coverageBreakdown.map(item => (
                        <div key={item.trigger} className="flex justify-between items-center rounded-lg bg-slate-50 p-3">
                            <span className="text-sm font-medium text-slate-700">{item.trigger}</span>
                            <span className="text-sm font-bold text-emerald-600">{item.payout}</span>
                        </div>
                    ))}
                </div>
                 <div className="mt-4 flex items-start gap-3 rounded-lg bg-sky-50 border-l-4 border-sky-400 p-4 text-sm text-sky-800">
                    <HelpCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                    <div>
                        <span className="font-bold">What does this mean?</span>
                        <p>If it rains > 15mm/hr in T. Nagar, you receive ₹360 automatically. No app action needed.</p>
                    </div>
                </div>
            </div>
        </div>
    </motion.div>
);

const Step3 = ({ onReset }: { onReset: () => void }) => (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="text-center">
        <div className="max-w-md mx-auto">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 shadow-lg">
                <CheckCircle className="h-16 w-16 text-emerald-500 mx-auto" />
                <h2 className="mt-4 text-3xl font-bold text-emerald-900">Policy Active!</h2>
                <p className="mt-2 text-emerald-800">You are now covered. We'll monitor your zone 24/7 and pay you automatically if any trigger fires.</p>
                <div className="mt-6 text-left space-y-2 rounded-lg bg-white p-4 text-sm">
                     <div className="flex justify-between">
                        <span className="text-slate-500">Policy ID</span>
                        <span className="font-mono font-semibold text-slate-700">POL-2026-W12-PRY</span>
                    </div>
                     <div className="flex justify-between">
                        <span className="text-slate-500">Week</span>
                        <span className="font-semibold text-slate-700">Mar 17–23, 2026</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-slate-500">Zone</span>
                        <span className="font-semibold text-slate-700">T. Nagar, Chennai</span>
                    </div>
                     <div className="flex justify-between">
                        <span className="text-slate-500">Razorpay Ref</span>
                        <span className="font-mono text-xs text-slate-500">pay_demo_PRY_W12</span>
                    </div>
                </div>
            </div>
             <button onClick={onReset} className="mt-8 rounded-lg bg-sky-500 px-6 py-3 text-base font-semibold text-white shadow-md hover:bg-sky-600">
                Buy Another Policy
            </button>
        </div>
    </motion.div>
);


export default function BuyPolicyPage() {
    const [step, setStep] = useState(0);

    const handleNext = () => setStep(s => s + 1);
    const handleReset = () => setStep(0);

    return (
      <AuthGuard allowedRoles={['worker']}>
        <div className="max-w-4xl mx-auto">
            <StepIndicator currentStep={step} />
            <div className="mt-8">
                <AnimatePresence mode="wait">
                    {step === 0 && <Step1 key="step1" onNext={handleNext} />}
                    {step === 1 && <Step2 key="step2" onNext={handleNext} />}
                    {step === 2 && <Step3 key="step3" onReset={handleReset} />}
                </AnimatePresence>
            </div>
        </div>
      </AuthGuard>
    );
}
