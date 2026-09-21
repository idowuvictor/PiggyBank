import express from 'express'
import cors from 'cors'
import { initDb, all, get } from './db'
import { startIndexer } from './indexer'
import { startKeeper } from './keeper'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
const port = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'piggybank-indexer' })
})

const formatPlan = (row: any) => {
  return {
    id: row.plan_id,
    owner: row.owner,
    goal: row.goal,
    totalRounds: row.total_rounds,
    roundAmount: row.round_amount,
    interval: row.interval,
    planStart: row.created_at_time,
    currentRoundIndex: row.current_round_index,
    nextPayment: row.created_at_time + (row.interval * (row.current_round_index + 1)),
    amountSaved: row.amount_saved,
    feesPaid: row.fees_paid,
    active: row.status === 'Active',
    completed: row.status === 'Completed'
  }
}

// Get all plans for a specific user
app.get('/api/plans/:owner', async (req, res) => {
  try {
    const owner = req.params.owner.toLowerCase()
    const rawPlans = await all(`
      SELECT * FROM plans 
      WHERE owner = ? 
      ORDER BY created_at_time DESC
    `, [owner])
    
    const plans = rawPlans.map(formatPlan)
    res.json({ plans })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// Get details and events for a specific plan
app.get('/api/plan/:planId', async (req, res) => {
  try {
    const planId = req.params.planId
    const rawPlan = await get(`SELECT * FROM plans WHERE plan_id = ?`, [planId])
    
    if (!rawPlan) {
      return res.status(404).json({ error: 'Plan not found' })
    }

    const plan = formatPlan(rawPlan)

    const events = await all(`
      SELECT * FROM events 
      WHERE plan_id = ? 
      ORDER BY block_number DESC, timestamp DESC
    `, [planId])

    res.json({ plan, events })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// Admin global stats
app.get('/api/admin/stats', async (req, res) => {
  try {
    const [totalPlansRes, activePlansRes, totalSavedRes, totalFeesRes, totalTargetRes, uniqueUsersRes, recentPlans] = await Promise.all([
      get(`SELECT COUNT(*) as count FROM plans`),
      get(`SELECT COUNT(*) as count FROM plans WHERE status = 'Active'`),
      get(`SELECT SUM(amount_saved) as total FROM plans WHERE status = 'Active'`),
      get(`SELECT SUM(fees_paid) as total FROM plans`),
      get(`SELECT SUM(goal) as total FROM plans`),
      get(`SELECT COUNT(DISTINCT owner) as count FROM plans`),
      all(`SELECT * FROM plans ORDER BY created_at_time DESC LIMIT 20`)
    ])

    res.json({
      totalPlans: totalPlansRes.count || 0,
      activePlans: activePlansRes.count || 0,
      totalSaved: totalSavedRes.total || 0,
      totalFees: totalFeesRes.total || 0,
      totalTargetGoals: totalTargetRes.total || 0,
      totalUsers: uniqueUsersRes.count || 0,
      recentPlans: recentPlans.map(formatPlan)
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// Sync status
app.get('/api/status', async (req, res) => {
  try {
    const state = await get(`SELECT last_synced_block FROM sync_state WHERE id = 1`)
    res.json(state)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

async function main() {
  await initDb()
  startIndexer()
  startKeeper()
  
  app.listen(port, () => {
    console.log(`Indexer API listening at http://localhost:${port}`)
  })
}

main().catch(console.error)
