import cron from 'node-cron'
import { JsonRpcProvider, Wallet, Contract } from 'ethers'
import { all } from './db'
import dotenv from 'dotenv'

dotenv.config()

const RPC_URL = process.env.RPC_URL || 'https://rpc.ankr.com/electroneum_testnet'
const PIGGYBANK_ADDRESS = process.env.PIGGYBANK_ADDRESS || '0xb87288B44F3fCAb62f37cEDe98A98Ab52352e545'
const KEEPER_PRIVATE_KEY = process.env.KEEPER_PRIVATE_KEY

if (!KEEPER_PRIVATE_KEY) {
  console.error('KEEPER_PRIVATE_KEY is required in .env')
  process.exit(1)
}

const provider = new JsonRpcProvider(RPC_URL)
const wallet = new Wallet(KEEPER_PRIVATE_KEY, provider)
const abi = ['function deduct(uint256 planId) external']
const contract = new Contract(PIGGYBANK_ADDRESS, abi, wallet)

async function processDuePlans(intervalFilter: number) {
  try {
    const activePlans = await all(`
      SELECT plan_id, created_at_time, interval, current_round_index, total_rounds 
      FROM plans 
      WHERE status = 'Active' AND interval = ?
    `, [intervalFilter])

    const now = Math.floor(Date.now() / 1000)

    for (const plan of activePlans) {
      if (plan.current_round_index >= plan.total_rounds) continue

      const nextPayment = plan.created_at_time + (plan.interval * (plan.current_round_index + 1))
      
      if (now >= nextPayment) {
        console.log(`Keeper: Plan ${plan.plan_id} is due for deduction. Executing...`)
        try {
          const tx = await contract.deduct(plan.plan_id)
          console.log(`Keeper: Transaction submitted: ${tx.hash}`)
        } catch (error) {
          console.error(`Keeper: Failed to deduct for plan ${plan.plan_id}`, error)
        }
      }
    }
  } catch (error) {
    console.error('Keeper error processing due plans:', error)
  }
}

export function startKeeper() {
  console.log(`Starting keeper service with address: ${wallet.address}`)
  
  // Daily plans: poll every 2 hours
  cron.schedule('0 */2 * * *', () => {
    console.log('Keeper: Checking daily plans...')
    processDuePlans(86400)
  })

  // Weekly plans: poll every 1 day (At 00:00)
  cron.schedule('0 0 * * *', () => {
    console.log('Keeper: Checking weekly plans...')
    processDuePlans(604800)
  })

  // Monthly plans: poll every 7 days (At 00:00 on Sunday)
  cron.schedule('0 0 * * 0', () => {
    console.log('Keeper: Checking monthly plans...')
    processDuePlans(2592000)
  })
}
