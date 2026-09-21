'use client'

import { useEffect, useState } from 'react'
import { BrowserProvider, Contract } from 'ethers'
import { CHAIN_ID, EXPLORER_URL, PIGGYBANK_ADDRESS, piggyAbi, RPC_URL, USDC_ADDRESS } from '../lib/contracts'

export type AdminStats = {
  totalPlans: number
  activePlans: number
  totalSaved: string
  totalFees: string
  totalTargetGoals: string
  totalUsers: number
  recentPlans: any[] // We can type this better, but any[] is fine for now
}

export type ContractConfig = {
  owner: string
  treasury: string
  defaultEmergencyFeeBps: number
  keeperIncentiveBps: number
  isUsdcAccepted: boolean
}

export function useAdmin() {
  const [account, setAccount] = useState('')
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [config, setConfig] = useState<ContractConfig | null>(null)
  const [status, setStatus] = useState('Checking admin access...')
  const [busy, setBusy] = useState(false)

  const canUseWallet = typeof window !== 'undefined' && Boolean(window.ethereum)

  useEffect(() => {
    if (canUseWallet) {
      window.ethereum.request({ method: 'eth_accounts' }).then(async (accounts: string[]) => {
        if (accounts.length > 0) {
          try {
            const provider = new BrowserProvider(window.ethereum)
            const network = await provider.getNetwork()
            if (Number(network.chainId) === CHAIN_ID) {
              setAccount(accounts[0])
              await loadAdminData(provider, accounts[0])
            } else {
              setStatus('Please connect to the correct network.')
            }
          } catch (e) {
            console.error(e)
          }
        } else {
          setStatus('Wallet not connected.')
        }
      }).catch(console.error)

      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length > 0) {
          setAccount(accounts[0])
          const provider = new BrowserProvider(window.ethereum)
          loadAdminData(provider, accounts[0])
        } else {
          setAccount('')
          setConfig(null)
          setStatus('Wallet disconnected.')
        }
      }

      const handleChainChanged = () => {
        window.location.reload()
      }

      window.ethereum.on('accountsChanged', handleAccountsChanged)
      window.ethereum.on('chainChanged', handleChainChanged)

      return () => {
        if (window.ethereum.removeListener) {
          window.ethereum.removeListener('accountsChanged', handleAccountsChanged)
          window.ethereum.removeListener('chainChanged', handleChainChanged)
        }
      }
    }
  }, [])

  async function loadAdminData(provider: BrowserProvider, address: string) {
    setBusy(true)
    try {
      const contract = new Contract(PIGGYBANK_ADDRESS, piggyAbi, provider)
      
      const [
        owner,
        treasury,
        defaultEmergencyFeeBps,
        keeperIncentiveBps,
        isUsdcAccepted
      ] = await Promise.all([
        contract.owner(),
        contract.treasury(),
        contract.defaultEmergencyFeeBps(),
        contract.keeperIncentiveBps(),
        contract.acceptedTokens(USDC_ADDRESS)
      ])

      setConfig({
        owner: owner.toLowerCase(),
        treasury,
        defaultEmergencyFeeBps: Number(defaultEmergencyFeeBps),
        keeperIncentiveBps: Number(keeperIncentiveBps),
        isUsdcAccepted
      })

      if (owner.toLowerCase() === address.toLowerCase()) {
        setStatus('Admin access granted.')
        // Fetch stats from indexer if authorized
        const res = await fetch(`http://localhost:3001/api/admin/stats`)
        if (res.ok) {
          const data = await res.json()
          setStats(data)
        }
      } else {
        setStatus('Access denied. You are not the contract owner.')
      }

    } catch (error) {
      console.error(error)
      setStatus('Failed to load admin data.')
    } finally {
      setBusy(false)
    }
  }

  async function connect() {
    if (!window.ethereum) {
      setStatus('Install MetaMask or another injected wallet to continue.')
      return
    }
    setBusy(true)
    try {
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
        provider = new BrowserProvider(window.ethereum)
      }
      
      const signer = await provider.getSigner()
      const address = await signer.getAddress()
      setAccount(address)
      
      await loadAdminData(provider, address)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not connect wallet.')
    } finally {
      setBusy(false)
    }
  }

  async function updateDefaultEmergencyFeeBps(bps: number) {
    if (!window.ethereum) return
    setBusy(true)
    try {
      const provider = new BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      const contract = new Contract(PIGGYBANK_ADDRESS, piggyAbi, signer)
      const tx = await contract.setDefaultEmergencyFeeBps(bps)
      setStatus('Transaction submitted. Waiting for confirmation...')
      await tx.wait()
      setStatus('Emergency fee updated successfully!')
      await loadAdminData(provider, account)
    } catch (error: any) {
      console.error(error)
      setStatus(error.reason || error.message || 'Transaction failed')
    } finally {
      setBusy(false)
    }
  }

  async function updateKeeperIncentiveBps(bps: number) {
    if (!window.ethereum) return
    setBusy(true)
    try {
      const provider = new BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      const contract = new Contract(PIGGYBANK_ADDRESS, piggyAbi, signer)
      const tx = await contract.setKeeperIncentiveBps(bps)
      setStatus('Transaction submitted. Waiting for confirmation...')
      await tx.wait()
      setStatus('Keeper incentive updated successfully!')
      await loadAdminData(provider, account)
    } catch (error: any) {
      console.error(error)
      setStatus(error.reason || error.message || 'Transaction failed')
    } finally {
      setBusy(false)
    }
  }

  async function updateTreasuryAddress(address: string) {
    if (!window.ethereum) return
    setBusy(true)
    try {
      const provider = new BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      const contract = new Contract(PIGGYBANK_ADDRESS, piggyAbi, signer)
      const tx = await contract.setTreasuryAddress(address)
      setStatus('Transaction submitted. Waiting for confirmation...')
      await tx.wait()
      setStatus('Treasury address updated successfully!')
      await loadAdminData(provider, account)
    } catch (error: any) {
      console.error(error)
      setStatus(error.reason || error.message || 'Transaction failed')
    } finally {
      setBusy(false)
    }
  }

  return {
    account,
    stats,
    config,
    status,
    busy,
    connect,
    updateDefaultEmergencyFeeBps,
    updateKeeperIncentiveBps,
    updateTreasuryAddress
  }
}
