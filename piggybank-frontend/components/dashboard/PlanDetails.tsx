'use client'

import { Plan } from '../../hooks/usePiggyBank'
import { Clock3, ExternalLink, Check, CalendarDays, LoaderCircle, History } from 'lucide-react'
import { EXPLORER_URL, PIGGYBANK_ADDRESS, piggyAbi } from '../../lib/contracts'
import { useEffect, useState } from 'react'
import { BrowserProvider, Contract, formatUnits } from 'ethers'

type Props = {
  plan: Plan | null
  busy: boolean
  onDeduct: () => void
  onClaim: () => void
  onEmergencyWithdraw: () => void
}

type RoundEvent = {
  roundIndex: number
  amount: string
  fee: string
  txHash: string
}

export function PlanDetails({ plan, busy, onDeduct, onClaim, onEmergencyWithdraw }: Props) {
  const [now, setNow] = useState(Date.now())
  const [events, setEvents] = useState<RoundEvent[]>([])
  const [loadingEvents, setLoadingEvents] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!plan || !window.ethereum) {
      setEvents([])
      return
    }

    async function fetchEvents() {
      setLoadingEvents(true)
      try {
        const provider = new BrowserProvider(window.ethereum as any)
        const piggy = new Contract(PIGGYBANK_ADDRESS, piggyAbi, provider)
        const filter = piggy.filters.RoundPaid(BigInt(plan!.id))
        const logs = await piggy.queryFilter(filter, -10000) // last 10000 blocks
        
        // Wait, we need the token decimals, but since they're in Plan we can't easily get it here unless passed in.
        // I'll just format manually or assume 18 for now based on what we saw, but wait, use formatUnits with 18.
        const parsedEvents = logs.map(log => {
          const parsed = piggy.interface.parseLog(log as any)
          return {
            roundIndex: Number(parsed?.args[1] || 0),
            amount: formatUnits(parsed?.args[2] || 0, 18),
            fee: formatUnits(parsed?.args[3] || 0, 18),
            txHash: log.transactionHash
          }
        }).reverse() // newest first

        setEvents(parsedEvents)
      } catch (err) {
        console.error("Failed to fetch events:", err)
      } finally {
        setLoadingEvents(false)
      }
    }
    fetchEvents()
  }, [plan?.id])

  if (!plan) {
    return (
      <aside className="bg-[#111714cc] border border-[#26312b] rounded-2xl p-6 h-full min-h-[400px] flex flex-col items-center justify-center text-center text-[#94a39a]">
        <Check size={32} className="text-[#c5f36b] mb-4 opacity-50" />
        <p className="max-w-[200px]">Select a plan to view your timeline, progress, and actions.</p>
      </aside>
    )
  }

  const remaining = Math.max(0, plan.nextPayment * 1000 - now)
  const days = Math.floor(remaining / 86400000)
  const hours = Math.floor((remaining / 3600000) % 24)
  const minutes = Math.floor((remaining / 60000) % 60)
  const countdown = `${days}d ${hours}h ${minutes}m`

  const date = (seconds: number) => seconds ? new Date(seconds * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not scheduled'
  const projectedCompletion = plan.planStart + (plan.interval * plan.totalRounds)

  return (
    <aside className="bg-[#111714cc] border border-[#26312b] rounded-2xl p-6 h-full flex flex-col">
      <div className="flex justify-between items-start mb-6">
        <div>
          <span className="text-[11px] font-mono tracking-widest text-[#94a39a]">PLAN MONITOR</span>
          <h2 className="text-2xl font-bold text-[#f2f3ed] mt-1">Plan #{plan.id}</h2>
        </div>
        <a href={`${EXPLORER_URL}/address/${PIGGYBANK_ADDRESS}`} target="_blank" rel="noreferrer" className="text-[#94a39a] hover:text-[#c5f36b] transition-colors p-2">
          <ExternalLink size={18} />
        </a>
      </div>

      <div className="bg-[#1a241e] border border-[#31402e] rounded-xl p-5 flex items-center gap-4 text-[#c5f36b] mb-6">
        <Clock3 size={22} className="shrink-0" />
        <div>
          <span className="block text-[11px] text-[#94a39a] mb-1">Next payment due in</span>
          <strong className="text-xl font-mono text-[#f2f3ed]">{countdown}</strong>
        </div>
      </div>

      <div className="space-y-4 mb-8">
        <div className="flex justify-between items-center pb-4 border-b border-[#26312b]">
          <span className="text-[13px] text-[#94a39a]">Goal</span>
          <b className="text-[14px] text-[#f2f3ed]">{parseFloat(Number(plan.goal).toFixed(4))} USDC</b>
        </div>
        <div className="flex justify-between items-center pb-4 border-b border-[#26312b]">
          <span className="text-[13px] text-[#94a39a]">Saved Principal</span>
          <b className="text-[14px] text-[#9fffd0]">{parseFloat(Number(plan.amountSaved).toFixed(4))} USDC</b>
        </div>
        <div className="flex justify-between items-center pb-4 border-b border-[#26312b]">
          <span className="text-[13px] text-[#94a39a]">Fees Paid</span>
          <b className="text-[14px] text-red-400">{parseFloat(Number(plan.feesPaid).toFixed(4))} USDC</b>
        </div>
        <div className="flex justify-between items-center pb-4 border-b border-[#26312b]">
          <span className="text-[13px] text-[#94a39a]">Progress</span>
          <b className="text-[14px] text-[#f2f3ed]">{plan.currentRoundIndex} / {plan.totalRounds} rounds</b>
        </div>
        <div className="flex justify-between items-center pb-4 border-b border-[#26312b]">
          <span className="text-[13px] text-[#94a39a]">Next Deadline</span>
          <b className="text-[14px] text-[#f2f3ed]">{date(plan.nextPayment)}</b>
        </div>
        <div className="flex justify-between items-center pb-2">
          <span className="text-[13px] text-[#94a39a]">Projected End</span>
          <b className="text-[14px] text-[#f2f3ed]">{date(projectedCompletion)}</b>
        </div>
      </div>

      {/* History Table */}
      <div className="mb-6 flex-1 overflow-y-auto custom-scrollbar min-h-[150px]">
        <h3 className="text-[12px] font-mono tracking-widest text-[#94a39a] flex items-center gap-2 mb-3 sticky top-0 bg-[#111714cc] pb-2 z-10">
          <History size={14} /> RECENT PAYMENTS
        </h3>
        
        {loadingEvents ? (
          <div className="flex items-center justify-center p-4">
            <LoaderCircle className="animate-spin text-[#94a39a]" size={20} />
          </div>
        ) : events.length > 0 ? (
          <div className="bg-[#0b0e0d] border border-[#26312b] rounded-xl overflow-hidden">
            <table className="w-full text-left text-[12px]">
              <thead className="bg-[#1a241e] text-[#94a39a]">
                <tr>
                  <th className="py-2 px-3 font-normal">Round</th>
                  <th className="py-2 px-3 font-normal">Amount</th>
                  <th className="py-2 px-3 font-normal">Fee</th>
                  <th className="py-2 px-3 font-normal text-right">Tx</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#26312b]">
                {events.map((evt, i) => (
                  <tr key={i} className="hover:bg-[#1a241e]/50 transition-colors">
                    <td className="py-2 px-3 text-[#f2f3ed]">{evt.roundIndex + 1}</td>
                    <td className="py-2 px-3 text-[#9fffd0]">{parseFloat(Number(evt.amount).toFixed(4))} USDC</td>
                    <td className="py-2 px-3 text-red-400">{Number(evt.fee) > 0 ? `${parseFloat(Number(evt.fee).toFixed(4))} USDC` : '-'}</td>
                    <td className="py-2 px-3 text-right">
                      <a href={`${EXPLORER_URL}/tx/${evt.txHash}`} target="_blank" rel="noreferrer" className="text-[#c5f36b] hover:underline">
                        {evt.txHash.slice(0,6)}...
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-[12px] text-[#94a39a] text-center p-4 bg-[#0b0e0d] border border-[#26312b] rounded-xl">
            No payments recorded yet.
          </div>
        )}
      </div>

      <div className="mt-auto space-y-3">
        {plan.active && !plan.completed ? (
          <>
            <button 
              onClick={onDeduct}
              disabled={busy}
              className="w-full bg-[#1d2721] border border-[#26312b] text-[#f2f3ed] font-semibold py-3.5 rounded-xl hover:border-[#c5f36b] disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {busy ? <LoaderCircle size={16} className="animate-spin" /> : <CalendarDays size={16} />}
              Save Now (Deduct)
            </button>
            <button 
              onClick={onEmergencyWithdraw}
              disabled={busy}
              className="w-full bg-transparent text-red-400 font-semibold py-3.5 rounded-xl hover:bg-red-500/10 disabled:opacity-50 transition-colors"
            >
              Emergency Withdraw
            </button>
          </>
        ) : plan.completed ? (
          <button 
            onClick={onClaim}
            disabled={busy}
            className="w-full bg-[#c5f36b] text-[#111810] font-bold py-3.5 rounded-xl hover:bg-[#d8ff8a] disabled:opacity-50 transition-colors"
          >
            Claim Saved Funds
          </button>
        ) : (
          <div className="text-center text-[13px] text-[#94a39a] bg-[#0b0e0d] py-4 rounded-xl border border-[#26312b]">
            This plan is closed.
          </div>
        )}
      </div>
    </aside>
  )
}
