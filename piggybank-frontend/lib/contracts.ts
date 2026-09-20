export const PIGGYBANK_ADDRESS = '0x8d09d183A2d0D5a9cC91172a8568e0A1C27314ce'
export const USDC_ADDRESS = '0xF2837cD516f35686cBfD91B8A523abE6216DdE52'
export const CHAIN_ID = 5201420
export const RPC_URL = 'https://rpc.ankr.com/electroneum_testnet'
export const EXPLORER_URL = 'https://blockexplorer.testnet.electroneum.com'

export const tokenAbi = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)'
]

export const piggyAbi = [
  // Read
  'function plans(uint256 planId) view returns (address owner, address token, uint256 goal, uint256 totalRounds, uint256 roundAmount, uint256 lastRoundAmount, uint256 periodLength, uint256 planStart, uint256 currentRoundIndex, uint256 currentRoundDeadline, uint256 emergencyFeeBps, uint256 amountSaved, uint256 feesPaid, bool active, bool completed)',
  'function getUserPlanIds(address user) view returns (uint256[])',
  'function computeRequiredApproval(uint256 goal) view returns (uint256)',
  
  // Write
  'function createPlan(address token, uint256 goal, uint8 cadence) returns (uint256 planId)',
  'function deduct(uint256 planId)',
  'function claimCompletion(uint256 planId)',
  'function emergencyWithdraw(uint256 planId)',
  
  // Events
  'event PlanCreated(uint256 indexed planId, address indexed owner, uint256 goal, uint8 cadence, uint256 roundAmount, uint256 totalRounds)',
  'event RoundPaid(uint256 indexed planId, uint256 indexed roundIndex, uint256 amount, uint256 fee)',
  'event CatchUpExecuted(uint256 indexed planId, uint256 roundsRecovered, uint256 totalFeesCharged)'
]
