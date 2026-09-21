'use client'

import { usePiggyBank } from '../../hooks/usePiggyBank'
import { Wallet, LoaderCircle } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { ReactNode } from 'react'
import HeroVideoBackground from '../HeroVideoBackground'

const HAND_VIDEO_URL = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260511_230229_7c9bc431-46cf-489a-948d-e8144d8eb5d4.mp4'

export function DashboardLayout({ children }: { children: ReactNode }) {
  const { account, connect, canUseWallet, mintTestTokens, busy } = usePiggyBank()

  const shorten = (str: string) => `${str.slice(0, 6)}...${str.slice(-4)}`

  return (
    <main className="min-h-screen bg-[#0b0e0d] text-[#f2f3ed] font-sans relative overflow-hidden">
      <HeroVideoBackground videoUrl={HAND_VIDEO_URL} />

      {/* Background Glow */}
      <div className="absolute w-[520px] h-[520px] rounded-full bg-[#b4ff7620] blur-[100px] -right-[180px] -top-[230px] pointer-events-none" />
      
      {/* Navigation */}
      <header className="h-[82px] flex items-center gap-7 max-w-[1180px] mx-auto px-8 border-b border-white/5 relative z-10">
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
        <div className="ml-auto flex items-center gap-3">
          {account && (
            <button 
              onClick={mintTestTokens}
              disabled={busy}
              className="bg-[#1a241e] border border-[#26312b] text-[#c5f36b] px-4 py-2.5 rounded-full font-bold inline-flex items-center gap-2 hover:bg-[#26312b] transition-colors disabled:opacity-50"
            >
              Faucet 1k USDC
            </button>
          )}
          <button 
            onClick={connect} 
            className="bg-[#c5f36b] text-[#111810] px-4 py-2.5 rounded-full font-bold inline-flex gap-2 items-center hover:bg-[#d8ff8a] transition-colors"
          >
            <Wallet size={15} />
            {account ? shorten(account) : 'Connect wallet'}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-[1180px] mx-auto px-8 pt-6 pb-20 relative z-10">
        {children}
      </div>
    </main>
  )
}
