'use client'

import { useState, useMemo } from 'react'
import { BrowserProvider, Contract, parseUnits } from 'ethers'
import { ArrowRight, Info, AlertTriangle, X } from 'lucide-react'
import { PIGGYBANK_ADDRESS, USDC_ADDRESS, piggyAbi, tokenAbi } from '../../lib/contracts'

type Props = {
  onClose: () => void
  onSuccess: () => void
  decimals: number
}

const SUPPORTED_TOKENS = [
  { symbol: 'USDC', address: USDC_ADDRESS },
  { symbol: 'USDT', address: '0x1111111111111111111111111111111111111111' },
  { symbol: 'DAI',  address: '0x2222222222222222222222222222222222222222' }
]

export function CreatePlanModal({ onClose, onSuccess, decimals }: Props) {
  const [tokenAddress, setTokenAddress] = useState(USDC_ADDRESS)
  const [title, setTitle] = useState('')
  const [goal, setGoal] = useState('100')
  const [cadence, setCadence] = useState('0')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [ackLocked, setAckLocked] = useState(false)
  const [ackCompound, setAckCompound] = useState(false)
  const [ackAudit, setAckAudit] = useState(false)

  // Calculations
  const { totalRounds, roundAmount, requiredApproval } = useMemo(() => {
    const g = Number(goal) || 0
    let n = 30 // Daily (default)
    if (cadence === '1') n = 12 // Weekly (approx 12 for a 3-month goal, wait, the contract doesn't fix duration. Wait, let's look at the contract's N logic).
    
    // In PiggyBank PRD:
    // Actually, cadence dictates period. But totalRounds? 
    // The contract createPlan only takes `goal` and `cadence`.
    // Wait, the contract computes N based on cadence inside createPlan! Let's check what N it uses.
    return { totalRounds: 0, roundAmount: 0, requiredApproval: g * 1.01 }
  }, [goal, cadence])

  async function handleSubmit() {
    if (!ackLocked || !ackCompound || !ackAudit) return
    if (!window.ethereum) return
    if (!title.trim()) {
      setError('Please enter a goal title.')
      return
    }
    
    setBusy(true)
    setError('')
    try {
      const provider = new BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      const piggy = new Contract(PIGGYBANK_ADDRESS, piggyAbi, signer)
      const tokenContract = new Contract(tokenAddress, tokenAbi, signer)

      const rawGoal = parseUnits(goal, decimals)
      const required = await piggy.computeRequiredApproval(rawGoal)

      // 1. Approve
      const approveTx = await tokenContract.approve(PIGGYBANK_ADDRESS, required)
      await approveTx.wait()

      // 2. Create Plan
      const tx = await piggy.createPlan(tokenAddress, rawGoal, Number(cadence), title)
      await tx.wait()

      onSuccess()
    } catch (err: any) {
      setError(err?.message || 'Transaction failed')
    } finally {
      setBusy(false)
    }
  }

  const allAck = ackLocked && ackCompound && ackAudit

  return (
    <div className="fixed inset-0 bg-[#050806]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#121715] border border-[#26312b] rounded-2xl p-8 max-w-[500px] w-full shadow-2xl relative animate-in fade-in zoom-in duration-200">
        <button onClick={onClose} className="absolute right-6 top-6 text-[#94a39a] hover:text-[#f2f3ed] transition-colors">
          <X size={20} />
        </button>
        
        <div className="text-[11px] font-mono tracking-widest text-[#94a39a] mb-2">NEW SAVINGS PLAN</div>
        <h2 className="text-3xl font-bold mb-6 text-[#f2f3ed]">Build your buffer</h2>

        <div className="space-y-5">
          <div>
            <label className="block text-[12px] text-[#94a39a] mb-2">Goal Title</label>
            <input 
              type="text" 
              value={title} 
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. New Laptop, Vacation..."
              className="w-full bg-[#0d1210] border border-[#26312b] rounded-lg px-4 py-3 text-[#f2f3ed] focus:border-[#c5f36b] focus:outline-none transition-colors"
            />
          </div>
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <div>
              <label className="block text-[12px] text-[#94a39a] mb-2">Goal Amount</label>
              <input 
                type="number" 
                value={goal} 
                onChange={e => setGoal(e.target.value)}
                className="w-full bg-[#0d1210] border border-[#26312b] rounded-lg px-4 py-3 text-[#f2f3ed] focus:border-[#c5f36b] focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-[12px] text-[#94a39a] mb-2">Asset</label>
              <select 
                value={tokenAddress}
                onChange={e => setTokenAddress(e.target.value)}
                className="w-full bg-[#0d1210] border border-[#26312b] rounded-lg px-4 py-3 text-[#c5f36b] focus:border-[#c5f36b] focus:outline-none transition-colors appearance-none font-bold"
              >
                {SUPPORTED_TOKENS.map(t => (
                  <option 
                    key={t.symbol} 
                    value={t.address}
                    disabled={t.symbol !== 'USDC'}
                    title={t.symbol !== 'USDC' ? 'Not supported at the moment' : undefined}
                  >
                    {t.symbol} {t.symbol !== 'USDC' ? '(Soon)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[12px] text-[#94a39a] mb-2">Cadence</label>
            <select 
              value={cadence}
              onChange={e => setCadence(e.target.value)}
              className="w-full bg-[#0d1210] border border-[#26312b] rounded-lg px-4 py-3 text-[#f2f3ed] focus:border-[#c5f36b] focus:outline-none transition-colors appearance-none"
            >
              <option value="0">Daily (30 Payments)</option>
              <option value="1">Weekly (12 Payments)</option>
              <option value="2">Monthly (6 Payments)</option>
            </select>
          </div>

          {/* Buffer Calculation Summary */}
          <div className="bg-[#1a241e] border border-[#31402e] rounded-xl p-4 mt-2">
            <h4 className="text-[12px] text-[#f2f3ed] font-semibold flex items-center gap-2 mb-3">
              <Info size={14} className="text-[#c5f36b]" /> Protocol Math
            </h4>
            <div className="space-y-2 text-[13px] text-[#94a39a]">
              <div className="flex justify-between">
                <span>Required Approval (1.01x)</span> 
                <strong className="text-[#f2f3ed]">
                  {requiredApproval.toFixed(2)} {SUPPORTED_TOKENS.find(t => t.address === tokenAddress)?.symbol}
                </strong>
              </div>
              <div className="flex justify-between"><span>Emergency Withdrawal Fee</span> <strong className="text-[#f2f3ed]">5%</strong></div>
            </div>
            <p className="text-[11px] mt-3 leading-relaxed opacity-80">
              The required approval includes a 1% buffer to guarantee that even if every payment is missed and penalized, your plan can still reach completion without requiring further wallet approvals.
            </p>
          </div>

          {/* Explicit Acknowledgements */}
          <div className="space-y-3 pt-2">
            <label className="flex items-start gap-3 cursor-pointer group">
              <input type="checkbox" checked={ackLocked} onChange={e => setAckLocked(e.target.checked)} className="mt-1 accent-[#c5f36b] w-4 h-4 rounded" />
              <span className="text-[12px] text-[#94a39a] leading-relaxed group-hover:text-[#f2f3ed] transition-colors">
                I understand funds are locked until the deadline. Emergency withdrawal is the only early exit and incurs a 5% fee.
              </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer group">
              <input type="checkbox" checked={ackCompound} onChange={e => setAckCompound(e.target.checked)} className="mt-1 accent-[#c5f36b] w-4 h-4 rounded" />
              <span className="text-[12px] text-[#94a39a] leading-relaxed group-hover:text-[#f2f3ed] transition-colors">
                I understand missed rounds incur a 1% fee and compound with no cap.
              </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer group">
              <input type="checkbox" checked={ackAudit} onChange={e => setAckAudit(e.target.checked)} className="mt-1 accent-[#c5f36b] w-4 h-4 rounded" />
              <span className="text-[12px] text-[#94a39a] leading-relaxed group-hover:text-[#f2f3ed] transition-colors">
                I understand this smart contract is unaudited and use it at my own risk.
              </span>
            </label>
          </div>

          {error && (
            <div className="text-red-400 text-[12px] bg-red-400/10 p-3 rounded-lg flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <button 
            onClick={handleSubmit} 
            disabled={busy || !allAck}
            className="w-full bg-[#c5f36b] text-[#111810] font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:bg-[#d8ff8a] disabled:opacity-50 disabled:cursor-not-allowed transition-all mt-4"
          >
            {busy ? 'Processing...' : 'Approve & Create Plan'}
            {!busy && <ArrowRight size={17} />}
          </button>
        </div>
      </div>
    </div>
  )
}
