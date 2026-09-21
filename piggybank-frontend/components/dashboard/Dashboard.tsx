'use client'

import { useState, useRef, useEffect } from 'react'
import { Plus, ChevronDown, ExternalLink, CheckCircle, Clock, AlertTriangle, Battery, LogOut, ArrowRight, Wallet, ShieldAlert } from 'lucide-react'
import { parseTxError } from '../../lib/utils'
import { DashboardLayout } from './DashboardLayout'
import { PlanList } from './PlanList'
import { PlanDetails } from './PlanDetails'
import { CreatePlanModal } from './CreatePlanModal'
import { EmergencyWithdrawDialog } from './EmergencyWithdrawDialog'
import { usePiggyBank } from '../../hooks/usePiggyBank'
import { CHAIN_ID } from '../../lib/contracts'

export function Dashboard() {
  const { account, balances, decimals, plans, status, busy, setBusy, setStatus, refresh } = usePiggyBank()
  
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showEmergency, setShowEmergency] = useState(false)
  
  const [selectedCurrency, setSelectedCurrency] = useState<'USDC' | 'ETN'>('USDC')
  const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(false)

  const selectedPlan = plans.find(p => p.id === selectedPlanId) || null

  const handleCreateSuccess = () => {
    setShowCreate(false)
    refresh()
  }

  const handleEmergencySuccess = () => {
    setShowEmergency(false)
    refresh()
  }

  const handleDeduct = async () => {
    if (!selectedPlan) return
    if (!window.ethereum) return
    setBusy(true)
    setStatus('Submitting payment...')
    try {
      const { BrowserProvider, Contract, parseUnits } = await import('ethers')
      const { piggyAbi, tokenAbi, PIGGYBANK_ADDRESS, USDC_ADDRESS } = await import('../../lib/contracts')
      const provider = new BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      const address = await signer.getAddress()
      
      const tokenContract = new Contract(USDC_ADDRESS, tokenAbi, signer)
      const balance = await tokenContract.balanceOf(address)
      const requiredAmount = parseUnits(selectedPlan.roundAmount.toString(), 6)
      
      if (balance < requiredAmount) {
        throw new Error('Insufficient USDC balance to complete this payment.')
      }

      const piggy = new Contract(PIGGYBANK_ADDRESS, piggyAbi, signer)
      const tx = await piggy.deduct(Number(selectedPlan.id))
      await tx.wait()
      await refresh()
      setStatus('Payment successful.')
    } catch (err: any) {
      setStatus(parseTxError(err))
    } finally {
      setBusy(false)
    }
  }

  const handleClaim = async () => {
    if (!selectedPlan) return
    if (!window.ethereum) return
    setBusy(true)
    setStatus('Claiming saved funds...')
    try {
      const { BrowserProvider, Contract } = await import('ethers')
      const { piggyAbi, PIGGYBANK_ADDRESS } = await import('../../lib/contracts')
      const provider = new BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      const piggy = new Contract(PIGGYBANK_ADDRESS, piggyAbi, signer)
      const tx = await piggy.claimCompletion(Number(selectedPlan.id))
      await tx.wait()
      await refresh()
      setStatus('Claim successful!')
    } catch (err: any) {
      setStatus(parseTxError(err))
    } finally {
      setBusy(false)
    }
  }

  const shorten = (str: string) => `${str.slice(0, 6)}...${str.slice(-4)}`

  return (
    <DashboardLayout>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <div>
          <div className="text-[11px] font-mono tracking-widest text-[#94a39a] mb-2">YOUR SAVINGS OVERVIEW</div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-2">Good saving<span className="text-[#c5f36b]">.</span></h1>
          <p className="text-[#94a39a]">Track every plan, payment, and completion date from one place.</p>
        </div>
        <button 
          onClick={() => setShowCreate(true)}
          className="bg-[#c5f36b] text-[#111810] font-bold px-5 py-3 rounded-xl flex items-center gap-2 hover:bg-[#d8ff8a] transition-colors whitespace-nowrap"
        >
          <Plus size={18} /> New savings plan
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <article className="bg-[#111714cc] border border-[#26312b] rounded-2xl p-6 relative z-10">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#c5f36b] to-[#9fffd0] rounded-t-2xl" />
          <span className="text-[11px] font-mono tracking-widest text-[#94a39a]">AVAILABLE BALANCE</span>
          <div className="flex items-end mt-4 mb-1 relative">
            <strong className="block text-3xl">
              {selectedCurrency === 'USDC' ? '$' : ''}{balances ? balances[selectedCurrency] : '0.00'}
            </strong>
            <button 
              onClick={() => setShowCurrencyDropdown(!showCurrencyDropdown)}
              className="flex items-center text-sm font-mono text-[#94a39a] ml-2 pb-1 hover:text-[#c5f36b] transition-colors"
            >
              {selectedCurrency} <ChevronDown size={14} className="ml-0.5" />
            </button>
            
            {showCurrencyDropdown && (
              <div className="absolute top-[100%] right-[30%] mt-1 bg-[#111714] border border-[#26312b] rounded-lg shadow-xl overflow-hidden min-w-[100px] z-50">
                <button 
                  onClick={() => { setSelectedCurrency('USDC'); setShowCurrencyDropdown(false) }}
                  className="w-full text-left px-4 py-2 text-sm text-[#94a39a] hover:bg-[#c5f36b] hover:text-[#111810] transition-colors"
                >
                  USDC
                </button>
                <button 
                  onClick={() => { setSelectedCurrency('ETN'); setShowCurrencyDropdown(false) }}
                  className="w-full text-left px-4 py-2 text-sm text-[#94a39a] hover:bg-[#c5f36b] hover:text-[#111810] transition-colors border-t border-[#26312b]"
                >
                  ETN
                </button>
              </div>
            )}
          </div>
          <p className="text-xs text-[#94a39a] mt-2">{account ? shorten(account) : 'Connect wallet to fetch balance'}</p>
        </article>
        
        <article className="bg-[#111714cc] border border-[#26312b] rounded-2xl p-6">
          <span className="text-[11px] font-mono tracking-widest text-[#94a39a]">ACTIVE PLANS</span>
          <strong className="block text-3xl mt-4 mb-1">{plans.filter(p => p.active).length}</strong>
          <p className="text-xs text-[#94a39a]">{plans.length} plan{plans.length === 1 ? '' : 's'} discovered</p>
        </article>

        <article className="bg-[#111714cc] border border-[#26312b] rounded-2xl p-6">
          <span className="text-[11px] font-mono tracking-widest text-[#94a39a]">NETWORK</span>
          <strong className="block text-xl mt-5 mb-1 flex items-center gap-2">
            <i className="w-2.5 h-2.5 rounded-full bg-[#c5f36b] shadow-[0_0_10px_#c5f36b]" />
            Electroneum
          </strong>
          <p className="text-xs text-[#94a39a] mt-2">Testnet · Chain ID {CHAIN_ID}</p>
        </article>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-4 min-h-[600px] lg:h-[720px]">
        <PlanList 
          plans={plans} 
          selectedId={selectedPlanId} 
          onSelect={setSelectedPlanId} 
          onRefresh={refresh} 
          busy={busy} 
          account={account} 
        />
        <PlanDetails 
          plan={selectedPlan} 
          busy={busy} 
          onDeduct={handleDeduct} 
          onClaim={handleClaim} 
          onEmergencyWithdraw={() => setShowEmergency(true)} 
        />
      </div>

      <div className="mt-6 text-center text-sm text-[#94a39a] bg-[#111714cc] border border-[#26312b] py-3 rounded-xl">
        Status: {status}
      </div>

      {showCreate && (
        <CreatePlanModal 
          decimals={decimals}
          onClose={() => setShowCreate(false)} 
          onSuccess={handleCreateSuccess} 
        />
      )}

      {showEmergency && selectedPlan && (
        <EmergencyWithdrawDialog 
          plan={selectedPlan} 
          onClose={() => setShowEmergency(false)} 
          onSuccess={handleEmergencySuccess} 
        />
      )}
    </DashboardLayout>
  )
}
