'use client'

import { useEffect, useMemo, useState } from 'react'
import { BrowserProvider, Contract, formatUnits, parseUnits } from 'ethers'
import { CHAIN_ID, EXPLORER_URL, PIGGYBANK_ADDRESS, piggyAbi, RPC_URL, tokenAbi, USDC_ADDRESS } from '../lib/contracts'

export type Plan = {
  id: string
  owner: string
  title: string
  goal: string
  totalRounds: number
  roundAmount: string
  interval: number
  planStart: number
  currentRoundIndex: number
  nextPayment: number
  amountSaved: string
  feesPaid: string
  active: boolean
  completed: boolean
}

export function usePiggyBank() {
  const [account, setAccount] = useState('')
  const [balances, setBalances] = useState<Record<string, string>>({ USDC: '0.00', ETN: '0.00' })
  const [decimals, setDecimals] = useState<number>(18)
  const [plans, setPlans] = useState<Plan[]>([])
  const [status, setStatus] = useState('Connect your wallet to view and manage your savings.')
  const [busy, setBusy] = useState(false)

  const canUseWallet = typeof window !== 'undefined' && Boolean(window.ethereum)

  useEffect(() => {
    if (canUseWallet) {
      // Check if already connected
      if (localStorage.getItem('piggybank_disconnected') !== 'true') {
        window.ethereum.request({ method: 'eth_accounts' }).then(async (accounts: string[]) => {
          if (accounts.length > 0) {
            try {
              const provider = new BrowserProvider(window.ethereum)
              const network = await provider.getNetwork()
              if (Number(network.chainId) === CHAIN_ID) {
                setAccount(accounts[0])
                await loadWalletData(provider, accounts[0])
              }
            } catch (e) {
              console.error(e)
            }
          }
        }).catch(console.error)
      }

      // Listen for account/chain changes
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length > 0) {
          setAccount(accounts[0])
          const provider = new BrowserProvider(window.ethereum)
          loadWalletData(provider, accounts[0])
        } else {
          setAccount('')
          setBalances({ USDC: '0.00', ETN: '0.00' })
          setPlans([])
          setStatus('Wallet disconnected.')
        }
      }

      const handleChainChanged = () => {
        window.location.reload()
      }

      const handleCustomConnect = () => {
        window.ethereum.request({ method: 'eth_accounts' }).then(async (accounts: string[]) => {
          if (accounts.length > 0) {
            try {
              const provider = new BrowserProvider(window.ethereum)
              const network = await provider.getNetwork()
              if (Number(network.chainId) === CHAIN_ID) {
                setAccount(accounts[0])
                await loadWalletData(provider, accounts[0])
              }
            } catch (e) {
              console.error(e)
            }
          }
        }).catch(console.error)
      }

      window.ethereum.on('accountsChanged', handleAccountsChanged)
      window.ethereum.on('chainChanged', handleChainChanged)
      window.addEventListener('piggybank_connect', handleCustomConnect)

      return () => {
        if (window.ethereum.removeListener) {
          window.ethereum.removeListener('accountsChanged', handleAccountsChanged)
          window.ethereum.removeListener('chainChanged', handleChainChanged)
        }
        window.removeEventListener('piggybank_connect', handleCustomConnect)
      }
    }
  }, [])

  async function connect() {
    if (!window.ethereum) {
      setStatus('Install MetaMask or another injected wallet to continue.')
      return
    }
    setBusy(true)
    try {
      localStorage.removeItem('piggybank_disconnected')
      
      let provider = new BrowserProvider(window.ethereum)
      await provider.send('eth_requestAccounts', [])
      const network = await provider.getNetwork()
      
      if (Number(network.chainId) !== CHAIN_ID) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x4F5F2C' }]
          })
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0x4F5F2C', // 5201420
                chainName: 'Electroneum Testnet',
                nativeCurrency: { name: 'Electroneum', symbol: 'ETN', decimals: 18 },
                rpcUrls: [RPC_URL],
                blockExplorerUrls: [EXPLORER_URL]
              }]
            })
          } else {
            throw switchError
          }
        }
        // Re-initialize provider after network switch
        provider = new BrowserProvider(window.ethereum)
      }
      
      const signer = await provider.getSigner()
      const address = await signer.getAddress()
      setAccount(address)
      
      await loadWalletData(provider, address)
      window.dispatchEvent(new Event('piggybank_connect'))
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not connect wallet.')
    } finally {
      setBusy(false)
    }
  }
  function disconnect() {
    localStorage.setItem('piggybank_disconnected', 'true')
    setAccount('')
    setBalances({ USDC: '0.00', ETN: '0.00' })
    setPlans([])
    setStatus('Wallet disconnected.')
    window.location.reload()
  }


  async function loadWalletData(provider: BrowserProvider, address: string) {
    try {
      const token = new Contract(USDC_ADDRESS, tokenAbi, provider)
      
      // Fetch token decimals for creating plans
      const tokenDecimals = await token.decimals()
      const decs = Number(tokenDecimals)
      setDecimals(decs)

      // Fetch native ETN balance
      const rawNative = await provider.getBalance(address)
      const etnDecimals = 18
      const etnBalance = Number(formatUnits(rawNative, etnDecimals)).toFixed(4)
      
      // Fetch USDC balance
      const rawUsdc = await token.balanceOf(address)
      const usdcBalance = Number(formatUnits(rawUsdc, decs)).toFixed(2)

      setBalances({
        USDC: usdcBalance,
        ETN: etnBalance
      })

      // Load plans
      // Load plans via Backend API
      const res = await fetch(`https://piggybank-t2k8.onrender.com/api/plans/${address}`)
      if (res.ok) {
        const data = await res.json()
        const formattedPlans = (data.plans || []).map((p: any) => ({
          ...p,
          goal: formatUnits(p.goal || '0', decs),
          roundAmount: formatUnits(p.roundAmount || '0', decs),
          amountSaved: formatUnits(p.amountSaved || '0', decs),
          feesPaid: formatUnits(p.feesPaid || '0', decs)
        }))
        setPlans(formattedPlans)
        setStatus((data.plans && data.plans.length) ? `Wallet connected. Found ${data.plans.length} plans.` : 'Wallet connected. No plans found.')
      } else {
        throw new Error('Failed to fetch from indexer API')
      }
    } catch (e) {
      setStatus('RPC read failed while loading plans.')
      console.error(e)
    }
  }

  async function refresh() {
    if (!account) return
    setBusy(true)
    const provider = new BrowserProvider(window.ethereum)
    await loadWalletData(provider, account)
    setBusy(false)
  }

  async function mintTestTokens() {
    if (!account || !window.ethereum) return
    setBusy(true)
    try {
      const provider = new BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      const token = new Contract(USDC_ADDRESS, tokenAbi, signer)
      // Mint 1000 USDC
      const tx = await token.mint(account, parseUnits('1000', decimals))
      await tx.wait()
      await refresh()
      setStatus('Minted 1,000 Test USDC!')
    } catch (e: any) {
      console.error(e)
      setStatus(e.message || 'Failed to mint test tokens')
    } finally {
      setBusy(false)
    }
  }

  return {
    account,
    balances,
    decimals,
    plans,
    status,
    busy,
    setBusy,
    setStatus,
    connect,
    refresh,
    mintTestTokens,
    disconnect,
    canUseWallet
  }
}
