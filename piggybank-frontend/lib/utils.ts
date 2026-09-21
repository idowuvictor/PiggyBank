import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
export function parseTxError(err: any): string {
  if (!err) return 'An unknown error occurred.'
  
  const msg = err.message || err.toString()
  
  // User rejection
  if (msg.includes('user rejected') || msg.includes('ACTION_REJECTED')) {
    return 'Transaction was cancelled by the user.'
  }
  
  // Insufficient funds
  if (msg.includes('insufficient funds') || msg.includes('INSUFFICIENT_FUNDS')) {
    return 'Insufficient ETN balance to pay for gas fees.'
  }

  // Allowance / Balance issues inside contract
  if (msg.includes('transfer amount exceeds balance') || msg.includes('ERC20: transfer amount exceeds balance')) {
    return 'Insufficient USDC balance in your wallet.'
  }
  if (msg.includes('insufficient allowance') || msg.includes('ERC20: insufficient allowance')) {
    return 'Insufficient USDC allowance. Please approve the tokens first.'
  }
  
  // Contract specific custom errors or generic reverts
  if (msg.includes('execution reverted')) {
    // Try to extract a specific reason if possible
    const reasonMatch = msg.match(/reason="([^"]+)"/)
    if (reasonMatch && reasonMatch[1]) {
      return `Transaction failed: ${reasonMatch[1]}`
    }
    return 'Transaction failed: Contract execution reverted.'
  }

  // Fallback for other verbose errors
  if (msg.length > 100) {
    return 'Transaction failed. Please check your wallet and try again.'
  }
  
  return msg
}
