import { LeadFlowEngine } from './services/lead-flow.engine'

let instance: LeadFlowEngine | null = null

export function getLeadFlowEngine(): LeadFlowEngine {
  if (!instance) {
    instance = new LeadFlowEngine()
  }
  return instance
}
