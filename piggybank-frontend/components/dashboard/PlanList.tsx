'use client'

import { Plan } from '../../hooks/usePiggyBank'
import { RefreshCw, CalendarDays, LoaderCircle, ArrowRight } from 'lucide-react'

type Props = {
  plans: Plan[]
  selectedId: string | null
  onSelect: (id: string) => void
  onRefresh: () => void
  busy: boolean
  account: string
}

export function PlanList({ plans, selectedId, onSelect, onRefresh, busy, account }: Props) {
  return (
    <section className="bg-[#111714cc] border border-[#26312b] rounded-2xl p-6 flex flex-col">
      <div className="flex justify-between items-start mb-6">
        <div>
          <span className="text-[11px] font-mono tracking-widest text-[#94a39a]">MY SAVINGS</span>
          <h2 className="text-2xl font-bold text-[#f2f3ed] mt-1">Created plans</h2>
        </div>
        <button 
          onClick={onRefresh}
          disabled={busy || !account}
          className="text-[#94a39a] hover:text-[#f2f3ed] disabled:opacity-50 transition-colors p-2"
          aria-label="Refresh plans"
        >
          <RefreshCw size={18} className={busy ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar">
        {plans.length > 0 ? (
          plans.map(plan => {
            const isSelected = selectedId === plan.id
            return (
              <button
                key={plan.id}
                onClick={() => onSelect(plan.id)}
                className={`w-full text-left flex items-center gap-4 p-4 rounded-xl border transition-all ${
                  isSelected 
                    ? 'bg-[#1a241e] border-[#c5f36b] shadow-[0_0_20px_#b4ff7615]' 
                    : 'bg-[#0b0e0d] border-[#26312b] hover:border-[#4a5f53]'
                }`}
              >
                <div className="w-11 h-11 shrink-0 rounded-lg bg-[#d8ff8a] text-[#15200f] flex items-center justify-center font-bold text-lg">
                  $
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <strong className="text-[#f2f3ed] truncate">{plan.title || `Plan #${plan.id}`}</strong>
                    <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full flex items-center gap-1.5 ${
                      plan.active ? 'text-[#c5f36b] bg-[#c5f36b]/10' : 
                      plan.completed ? 'text-[#9fffd0] bg-[#9fffd0]/10' : 
                      'text-[#94a39a] bg-[#94a39a]/10'
                    }`}>
                      <i className={`w-1.5 h-1.5 rounded-full ${
                        plan.active ? 'bg-[#c5f36b]' : plan.completed ? 'bg-[#9fffd0]' : 'bg-[#94a39a]'
                      }`} />
                      {plan.active ? 'Active' : plan.completed ? 'Completed' : 'Closed'}
                    </span>
                  </div>
                  <span className="font-mono text-[#f2f3ed]">
                    {parseFloat(Number(plan.roundAmount).toFixed(4))} USDC · {Math.round(plan.interval / 86400)} day cadence
                  </span>
                </div>
              </button>
            )
          })
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 text-[#94a39a]">
            <CalendarDays size={32} className="mb-4 text-[#c5f36b] opacity-80" />
            <strong className="text-[#f2f3ed] block mb-2">No plans loaded</strong>
            <p className="text-[13px] leading-relaxed">
              Connect your wallet and scan the blockchain for your active plans.
            </p>
          </div>
        )}
      </div>

      <div className="mt-6 pt-6 border-t border-[#26312b]">
        <button 
          onClick={onRefresh} 
          disabled={busy || !account}
          className="w-full bg-[#1d2721] border border-[#26312b] text-[#f2f3ed] font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:bg-[#26312b] disabled:opacity-50 transition-colors"
        >
          {busy ? <LoaderCircle size={16} className="animate-spin" /> : 'Scan Wallet'} 
          {!busy && <ArrowRight size={16} />}
        </button>
      </div>
    </section>
  )
}
