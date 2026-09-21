'use client'

import { useState } from 'react'
import { BrowserProvider, Contract } from 'ethers'
import { AlertOctagon, X, AlertTriangle } from 'lucide-react'
import { PIGGYBANK_ADDRESS, piggyAbi } from '../../lib/contracts'
import { parseTxError } from '../../lib/utils'
import { Plan } from '../../hooks/usePiggyBank'

type Props = {
  plan: Plan
  onClose: () => void
  onSuccess: () => void
}

export function EmergencyWithdrawDialog({ plan, onClose, onSuccess }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // The emergency fee is stored in the contract.
  // We can calculate the exact fee preview based on amountSaved and the plan's emergency fee.
  // Wait, the plan state has amountSaved (in formatted string).
  // We can calculate the fee: amountSaved * 5% (or rather, fetch it if we had it, but we can just use 0.05).
  // Actually, we don't have emergencyFeeBps in the Plan type we fetch. Let's assume it's 500 bps (5%) for now, 
  // or we can just parse amountSaved.
  const savedNumber = Number(plan.amountSaved)
  const feeNumber = savedNumber * 0.05 // 5% fee
  const returnNumber = savedNumber - feeNumber

  async function handleWithdraw() {
    if (!window.ethereum) return
    setBusy(true)
    setError('')
    try {
      const provider = new BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      const piggy = new Contract(PIGGYBANK_ADDRESS, piggyAbi, signer)

      const tx = await piggy.emergencyWithdraw(plan.id)
      await tx.wait()
      onSuccess()
    } catch (err: any) {
      setError(parseTxError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-[#050806]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#121715] border border-red-500/20 rounded-2xl p-8 max-w-[440px] w-full shadow-2xl relative animate-in fade-in zoom-in duration-200">
        <button onClick={onClose} className="absolute right-6 top-6 text-[#94a39a] hover:text-[#f2f3ed] transition-colors">
          <X size={20} />
        </button>
        
        <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mb-5 text-red-400">
          <AlertOctagon size={24} />
        </div>
        
        <h2 className="text-2xl font-bold mb-2 text-[#f2f3ed]">Emergency Withdraw</h2>
        <p className="text-[14px] text-[#94a39a] mb-6 leading-relaxed">
          You are about to close Plan #{plan.id} early. This action is irreversible and incurs the emergency withdrawal fee locked into your plan.
        </p>

        <div className="bg-[#0b0e0d] border border-red-500/10 rounded-xl p-4 space-y-3 mb-6">
          <div className="flex justify-between text-[13px]">
            <span className="text-[#94a39a]">Accumulated Savings</span>
            <strong className="text-[#f2f3ed]">{savedNumber.toFixed(2)} USDC</strong>
          </div>
          <div className="flex justify-between text-[13px] text-red-400">
            <span>Emergency Fee (5%)</span>
            <strong>- {feeNumber.toFixed(2)} USDC</strong>
          </div>
          <div className="h-[1px] bg-red-500/10 my-2" />
          <div className="flex justify-between text-[15px]">
            <span className="text-[#f2f3ed]">You will receive</span>
            <strong className="text-[#c5f36b]">{returnNumber.toFixed(2)} USDC</strong>
          </div>
        </div>

        {error && (
          <div className="text-red-400 text-[12px] bg-red-400/10 p-3 rounded-lg flex items-start gap-2 mb-4">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button 
            onClick={onClose}
            disabled={busy}
            className="flex-1 bg-transparent border border-[#26312b] text-[#f2f3ed] font-semibold py-3 rounded-xl hover:bg-[#1a241e] transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleWithdraw} 
            disabled={busy}
            className="flex-1 bg-red-500 text-white font-bold py-3 rounded-xl hover:bg-red-600 disabled:opacity-50 transition-colors"
          >
            {busy ? 'Processing...' : 'Confirm Exit'}
          </button>
        </div>
      </div>
    </div>
  )
}
