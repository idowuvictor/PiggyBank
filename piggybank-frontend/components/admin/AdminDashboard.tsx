'use client'

import React, { useState } from 'react'
import { useAdmin } from '../../hooks/useAdmin'
import { Activity, Settings, Save, AlertTriangle, ShieldCheck, Wallet } from 'lucide-react'
import { formatUnits } from 'ethers'

export default function AdminDashboard() {
  const { account, stats, config, status, busy, connect, updateDefaultEmergencyFeeBps, updateKeeperIncentiveBps, updateTreasuryAddress } = useAdmin()

  const [emerFee, setEmerFee] = useState('')
  const [keeperFee, setKeeperFee] = useState('')
  const [treasury, setTreasury] = useState('')

  if (!account) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldCheck className="w-16 h-16 text-[#c5f36b] mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Admin Dashboard</h2>
        <p className="text-[#94a39a] mb-6 max-w-md">Connect your wallet to access the PiggyBank protocol administration interface. You must be the contract owner.</p>
        <button
          onClick={connect}
          disabled={busy}
          className="bg-[#c5f36b] text-[#0b0e0d] px-6 py-3 rounded-full font-semibold hover:bg-[#b0d95f] transition-all disabled:opacity-50"
        >
          {busy ? 'Connecting...' : 'Connect Wallet'}
        </button>
      </div>
    )
  }

  // If connected but not owner (config is null because loadAdminData sets it only after fetching, wait, loadAdminData always sets config if successful, but let's check stats as the indicator for full auth)
  if (config && account.toLowerCase() !== config.owner.toLowerCase()) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertTriangle className="w-16 h-16 text-red-500 mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
        <p className="text-[#94a39a] mb-6 max-w-md">Your connected address ({account.slice(0,6)}...{account.slice(-4)}) is not the contract owner.</p>
      </div>
    )
  }

  return (
    <div className="max-w-[1180px] mx-auto px-4 md:px-8 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-[#c5f36b]" />
            Admin Dashboard
          </h1>
          <p className="text-sm text-[#94a39a] mt-1">{status}</p>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#121614] rounded-2xl p-6 border border-white/5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[#94a39a] text-sm">Total TVL (USDC)</span>
              <Activity className="w-5 h-5 text-[#c5f36b]" />
            </div>
            <div className="text-2xl font-bold text-white">
              ${Number(formatUnits(stats.totalSaved, 6)).toLocaleString()}
            </div>
          </div>
          <div className="bg-[#121614] rounded-2xl p-6 border border-white/5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[#94a39a] text-sm">Active Plans</span>
              <Activity className="w-5 h-5 text-[#c5f36b]" />
            </div>
            <div className="text-2xl font-bold text-white">
              {stats.activePlans} <span className="text-sm text-[#94a39a] font-normal">/ {stats.totalPlans} total</span>
            </div>
          </div>
          <div className="bg-[#121614] rounded-2xl p-6 border border-white/5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[#94a39a] text-sm">Total Fees Collected</span>
              <Activity className="w-5 h-5 text-[#c5f36b]" />
            </div>
            <div className="text-2xl font-bold text-white">
              ${Number(formatUnits(stats.totalFees, 6)).toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {config && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-[#121614] rounded-2xl p-6 border border-white/5 space-y-6">
            <div className="flex items-center gap-2 mb-2">
              <Settings className="w-5 h-5 text-[#c5f36b]" />
              <h2 className="text-lg font-bold text-white">Protocol Configuration</h2>
            </div>

            <div>
              <label className="block text-sm text-[#94a39a] mb-2">Default Emergency Fee (Current: {config.defaultEmergencyFeeBps / 100}%)</label>
              <div className="flex gap-2">
                <input 
                  type="number" 
                  placeholder="New BPS (e.g., 500 for 5%)" 
                  className="bg-[#1a1e1c] border border-white/10 rounded-xl px-4 py-3 text-white flex-1 focus:outline-none focus:border-[#c5f36b]"
                  value={emerFee}
                  onChange={(e) => setEmerFee(e.target.value)}
                />
                <button 
                  onClick={() => updateDefaultEmergencyFeeBps(Number(emerFee))}
                  disabled={busy || !emerFee}
                  className="bg-[#242926] hover:bg-[#c5f36b] hover:text-[#0b0e0d] text-white px-4 py-3 rounded-xl transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  <Save className="w-4 h-4" /> Save
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm text-[#94a39a] mb-2">Keeper Incentive (Current: {config.keeperIncentiveBps / 100}%)</label>
              <div className="flex gap-2">
                <input 
                  type="number" 
                  placeholder="New BPS (e.g., 2000 for 20%)" 
                  className="bg-[#1a1e1c] border border-white/10 rounded-xl px-4 py-3 text-white flex-1 focus:outline-none focus:border-[#c5f36b]"
                  value={keeperFee}
                  onChange={(e) => setKeeperFee(e.target.value)}
                />
                <button 
                  onClick={() => updateKeeperIncentiveBps(Number(keeperFee))}
                  disabled={busy || !keeperFee}
                  className="bg-[#242926] hover:bg-[#c5f36b] hover:text-[#0b0e0d] text-white px-4 py-3 rounded-xl transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  <Save className="w-4 h-4" /> Save
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm text-[#94a39a] mb-2">Treasury Address</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder={config.treasury} 
                  className="bg-[#1a1e1c] border border-white/10 rounded-xl px-4 py-3 text-white flex-1 focus:outline-none focus:border-[#c5f36b] font-mono text-sm"
                  value={treasury}
                  onChange={(e) => setTreasury(e.target.value)}
                />
                <button 
                  onClick={() => updateTreasuryAddress(treasury)}
                  disabled={busy || !treasury}
                  className="bg-[#242926] hover:bg-[#c5f36b] hover:text-[#0b0e0d] text-white px-4 py-3 rounded-xl transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  <Save className="w-4 h-4" /> Save
                </button>
              </div>
            </div>

          </div>

          <div className="bg-[#121614] rounded-2xl p-6 border border-white/5 h-fit">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-[#c5f36b]" />
              Contract Details
            </h2>
            <div className="space-y-4 text-sm">
              <div className="flex justify-between pb-4 border-b border-white/5">
                <span className="text-[#94a39a]">Contract Owner</span>
                <span className="text-white font-mono">{config.owner.slice(0,6)}...{config.owner.slice(-4)}</span>
              </div>
              <div className="flex justify-between pb-4 border-b border-white/5">
                <span className="text-[#94a39a]">Treasury</span>
                <span className="text-white font-mono">{config.treasury.slice(0,6)}...{config.treasury.slice(-4)}</span>
              </div>
              <div className="flex justify-between pb-4 border-b border-white/5">
                <span className="text-[#94a39a]">USDC Accepted</span>
                <span className="text-white">{config.isUsdcAccepted ? 'Yes' : 'No'}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
