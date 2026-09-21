import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, ShieldCheck, Timer, WalletCards } from 'lucide-react'
import HeroVideoBackground from '../components/HeroVideoBackground'

const PIGGYBANK = '0x8d09d183A2d0D5a9cC91172a8568e0A1C27314ce'
const USDC = '0xF2837cD516f35686cBfD91B8A523abE6216DdE52'
const UNIVERSE_VIDEO_URL = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260912_104036_bd6924f6-3c8e-417e-8465-6d03c8c2e9e6.mp4'

export default function HomePage() {
  return (
    <main className="piggy-app">
      <HeroVideoBackground 
        videoUrl={UNIVERSE_VIDEO_URL} 
        cssFilter="hue-rotate(150deg) sepia(0.2) saturate(1.2) brightness(0.85)" 
      />
      <header className="piggy-nav relative z-10">
        <Link className="piggy-logo flex items-center gap-2" href="/">
          <Image src="/piggy-logo.jpeg" alt="PiggyBank Logo" width={32} height={32} className="rounded-lg" />
          <div>Piggy<span>Bank</span></div>
        </Link>
        <nav className="site-nav" aria-label="Primary navigation">
          <Link className="active" href="/">Home</Link>
          <Link href="/dashboard">Dashboard</Link>
        </nav>
        <div className="network-pill"><i /> Electroneum Testnet</div>
        <Link className="wallet-btn" href="/dashboard">Launch app <ArrowRight size={15} /></Link>
      </header>
      <section className="piggy-content home-content relative z-10" id="top">
        <div className="eyebrow">AUTOMATED SAVINGS PROTOCOL <span>•</span> TESTNET</div>
        <h1>Make saving<br /><em>automatic.</em></h1>
        <p className="piggy-lede">PiggyBank turns your crypto assets into a habit. Create a plan, approve once, and monitor every payment until your goal is complete.</p>
        <div className="hero-actions"><Link className="primary-action hero-cta" href="/dashboard">Create a savings plan <ArrowRight size={17} /></Link><Link className="secondary-action" href="/dashboard">View dashboard</Link></div>
        <div className="feature-grid">
          <article><WalletCards size={20} /><h3>One approval</h3><p>Set up your recurring savings in one simple flow.</p></article>
          <article><Timer size={20} /><h3>Never miss a due date</h3><p>See the next payment and completion date at a glance.</p></article>
          <article><ShieldCheck size={20} /><h3>On-chain by design</h3><p>Transparent, non-custodial savings on Electroneum.</p></article>
        </div>
      </section>
      <footer className="piggy-footer"><span>Non-custodial. On-chain. Transparent.</span><a href={`https://blockexplorer.testnet.electroneum.com/address/${PIGGYBANK}`} target="_blank" rel="noreferrer">View contract ↗</a></footer>
    </main>
  )
}

export { PIGGYBANK, USDC }
