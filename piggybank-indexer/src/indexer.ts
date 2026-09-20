import { JsonRpcProvider, Contract, EventLog, Interface } from 'ethers'
import { db, run, get } from './db'
import dotenv from 'dotenv'

dotenv.config()

const RPC_URL = process.env.RPC_URL || 'https://rpc.ankr.com/electroneum_testnet'
const PIGGYBANK_ADDRESS = process.env.PIGGYBANK_ADDRESS || '0x8d09d183A2d0D5a9cC91172a8568e0A1C27314ce'
const SYNC_INTERVAL_MS = 10000 // 10 seconds polling

const abi = [
  'event PlanCreated(uint256 indexed planId, address indexed owner, uint256 goal, uint8 cadence, uint256 roundAmount, uint256 totalRounds)',
  'event RoundPaid(uint256 indexed planId, uint256 indexed roundIndex, uint256 amount, uint256 fee)',
  'event CatchUpExecuted(uint256 indexed planId, uint256 roundsRecovered, uint256 totalFeesCharged)',
  'event PlanCompleted(uint256 indexed planId, address indexed owner, uint256 totalSaved)',
  'event EmergencyWithdrawn(uint256 indexed planId, address indexed owner, uint256 amountReturned, uint256 feeCharged)'
]

const provider = new JsonRpcProvider(RPC_URL)
const contract = new Contract(PIGGYBANK_ADDRESS, abi, provider)

async function syncEvents() {
  try {
    const state = await get(`SELECT last_synced_block FROM sync_state WHERE id = 1`) as any
    const fromBlock = state.last_synced_block + 1
    const latestBlock = await provider.getBlockNumber()

    if (fromBlock > latestBlock) {
      return // Already up to date
    }

    // Process blocks in chunks to avoid RPC limits
    const CHUNK_SIZE = 1000
    for (let currentFrom = fromBlock; currentFrom <= latestBlock; currentFrom += CHUNK_SIZE) {
      const currentTo = Math.min(currentFrom + CHUNK_SIZE - 1, latestBlock)
      console.log(`Syncing blocks ${currentFrom} to ${currentTo}...`)

      const logs = await contract.queryFilter('*', currentFrom, currentTo)
      
      for (const log of logs) {
        if (!(log instanceof EventLog)) continue
        
        await processEvent(log)
      }

      await run(`UPDATE sync_state SET last_synced_block = ? WHERE id = 1`, [currentTo])
    }
  } catch (error) {
    console.error('Error during sync:', error)
  }
}

async function processEvent(log: EventLog) {
  const { eventName, args, transactionHash, blockNumber } = log
  
  if (eventName === 'PlanCreated') {
    const [planId, owner, goal, cadence, roundAmount, totalRounds] = args
    const interval = cadence === 0n ? 86400 : cadence === 1n ? 604800 : 2592000
    const token = '0xF2837cD516f35686cBfD91B8A523abE6216DdE52' // Hardcoding USDC for now
    
    // Check if exists
    const existing = await get(`SELECT plan_id FROM plans WHERE plan_id = ?`, [planId.toString()])
    if (!existing) {
      const block = await log.getBlock()
      await run(`
        INSERT INTO plans (plan_id, owner, token, goal, interval, total_rounds, round_amount, created_at_block, created_at_time)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        planId.toString(),
        owner.toLowerCase(),
        token,
        goal.toString(),
        interval,
        Number(totalRounds),
        roundAmount.toString(),
        blockNumber,
        block.timestamp
      ])
      console.log(`Indexed PlanCreated: ${planId}`)
    }
  } 
  
  else if (eventName === 'RoundPaid') {
    const [planId, roundIndex, amount, fee] = args
    
    // Record event
    await run(`
      INSERT INTO events (plan_id, event_type, amount, fee, round_index, tx_hash, block_number, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      planId.toString(),
      'RoundPaid',
      amount.toString(),
      fee.toString(),
      Number(roundIndex),
      transactionHash,
      blockNumber,
      (await log.getBlock()).timestamp
    ])
    
    // Update plan totals
    await run(`
      UPDATE plans 
      SET amount_saved = CAST(CAST(amount_saved AS NUMERIC) + ? AS TEXT),
          fees_paid = CAST(CAST(fees_paid AS NUMERIC) + ? AS TEXT),
          current_round_index = current_round_index + 1
      WHERE plan_id = ?
    `, [amount.toString(), fee.toString(), planId.toString()])
    console.log(`Indexed RoundPaid for plan ${planId}`)
  }
  
  else if (eventName === 'CatchUpExecuted') {
    const [planId, roundsRecovered, totalFeesCharged] = args
    await run(`
      INSERT INTO events (plan_id, event_type, fee, tx_hash, block_number, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      planId.toString(),
      'CatchUpExecuted',
      totalFeesCharged.toString(),
      transactionHash,
      blockNumber,
      (await log.getBlock()).timestamp
    ])
  }
  
  else if (eventName === 'PlanCompleted') {
    const [planId, owner, totalSaved] = args
    await run(`UPDATE plans SET status = 'Completed' WHERE plan_id = ?`, [planId.toString()])
    
    await run(`
      INSERT INTO events (plan_id, event_type, amount, tx_hash, block_number, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      planId.toString(),
      'PlanCompleted',
      totalSaved.toString(),
      transactionHash,
      blockNumber,
      (await log.getBlock()).timestamp
    ])
    console.log(`Indexed PlanCompleted for plan ${planId}`)
  }
  
  else if (eventName === 'EmergencyWithdrawn') {
    const [planId, owner, amountReturned, feeCharged] = args
    await run(`UPDATE plans SET status = 'Closed' WHERE plan_id = ?`, [planId.toString()])
    
    await run(`
      INSERT INTO events (plan_id, event_type, amount, fee, tx_hash, block_number, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      planId.toString(),
      'EmergencyWithdrawn',
      amountReturned.toString(),
      feeCharged.toString(),
      transactionHash,
      blockNumber,
      (await log.getBlock()).timestamp
    ])
    console.log(`Indexed EmergencyWithdrawn for plan ${planId}`)
  }
}

export function startIndexer() {
  console.log('Starting indexer polling loop...')
  syncEvents()
  setInterval(syncEvents, SYNC_INTERVAL_MS)
}
