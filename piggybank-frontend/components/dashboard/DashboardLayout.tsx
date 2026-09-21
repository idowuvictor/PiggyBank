'use client'

import { usePiggyBank } from '../../hooks/usePiggyBank'
import { useState, ReactNode } from 'react'
import { Wallet, LogOut, LoaderCircle } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import HeroVideoBackground from '../HeroVideoBackground'

const HAND_VIDEO_URL = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260511_230229_7c9bc431-46cf-489a-948d-e8144d8eb5d4.mp4'

export function DashboardLayout({ children }: { children: ReactNode }) {
  const { account, connect, disconnect, canUseWallet, mintTestTokens, busy } = usePiggyBank()
  const [showDropdown, setShowDropdown] = useState(false)

  const shorten = (str: string) => `${str.slice(0, 6)}...${str.slice(-4)}`

  return (
    <main className="min-h-screen bg-[#0b0e0d] text-[#f2f3ed] font-sans relative overflow-hidden">
      <HeroVideoBackground videoUrl={HAND_VIDEO_URL} />

      {/* Background Glow */}
      <div className="absolute w-[520px] h-[520px] rounded-full bg-[#b4ff7620] blur-[100px] -right-[180px] -top-[230px] pointer-events-none" />
      
      <header className="h-[82px] flex items-center gap-7 max-w-[1180px] mx-auto px-8 border-b border-white/5 relative z-50">
        <Link href="/" className="flex items-center">
          <Image src="/piggy-new.png" alt="PiggyBank Logo" width={160} height={40} className="h-10 w-auto rounded-md object-contain" priority />
        </Link>
        <nav className="hidden md:flex gap-5 ml-5" aria-label="Primary navigation">
          <Link href="/" className="text-[#94a39a] hover:text-[#f2f3ed] text-[13px] no-underline transition-colors">Home</Link>
          <Link href="/dashboard" className="text-[#94a39a] hover:text-[#f2f3ed] text-[13px] no-underline transition-colors">Dashboard</Link>
          <Link href="/admin" className="text-[#94a39a] hover:text-[#f2f3ed] text-[13px] no-underline transition-colors">Admin</Link>
        </nav>
        <div className="hidden md:flex font-mono text-[12px] text-[#94a39a] border border-[#26312b] px-3 py-2 rounded-full items-center gap-2">
          <i className="w-[7px] h-[7px] rounded-full bg-[#c5f36b] shadow-[0_0_10px_#c5f36b]" /> 
          Electroneum Testnet
        </div>
        <div className="ml-auto flex items-center gap-3 relative">
          {account && (
            <button 
              onClick={mintTestTokens}
              disabled={busy}
              className="bg-[#1a241e] border border-[#26312b] text-[#c5f36b] px-4 py-2.5 rounded-full font-bold inline-flex items-center gap-2 hover:bg-[#26312b] transition-colors disabled:opacity-50"
            >
              Faucet 1k USDC
            </button>
          )}
          
          {account ? (
            <div className="relative">
              <button 
                onClick={() => setShowDropdown(!showDropdown)} 
                className="bg-[#c5f36b] text-[#111810] px-4 py-2.5 rounded-full font-bold inline-flex gap-2 items-center hover:bg-[#d8ff8a] transition-colors"
              >
                <Wallet size={15} />
                {shorten(account)}
              </button>
              
              {showDropdown && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-[#121715] border border-[#26312b] rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 z-50">
                  <div className="px-4 py-3 border-b border-[#26312b]/50">
                    <p className="text-[11px] text-[#94a39a] uppercase tracking-wider mb-1">Connected as</p>
                    <p className="text-sm font-mono text-[#f2f3ed] truncate">{shorten(account)}</p>
                  </div>
                  <button 
                    onClick={() => {
                      setShowDropdown(false)
                      disconnect()
                    }}
                    className="w-full text-left px-4 py-3 text-red-400 hover:bg-red-400/10 flex items-center gap-2 transition-colors text-sm font-semibold"
                  >
                    <LogOut size={15} />
                    Disconnect
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button 
              onClick={connect} 
              className="bg-[#c5f36b] text-[#111810] px-4 py-2.5 rounded-full font-bold inline-flex gap-2 items-center hover:bg-[#d8ff8a] transition-colors"
            >
              <Wallet size={15} />
              Connect wallet
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-[1180px] mx-auto px-8 pt-6 pb-20 relative z-10">
        {children}
      </div>
    </main>
  )
}
