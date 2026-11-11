export interface Profile {
  id: string;
  gym_id: string;
  name: string;
  role: "admin" | "coach";
  active: boolean;
}
export interface Gym {
  id: string;
  name: string;
  currency: string;
  timezone: string;
}
export interface Coach {
  id: string;
  gym_id: string;
  name: string;
  active: boolean;
}
export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  active: boolean;
  external_id: string | null;
  created_at: string;
}
export interface Assignment {
  customer_id: string;
  coach_id: string;
  active: boolean;
}
export interface Package {
  id: string;
  customer_id: string;
  original_coach_id: string;
  quantity: number;
  unit_price: number | null;
  currency: string;
  kind: string;
  purchased_at: string;
  reason: string | null;
  tier_id: string | null;
  external_id: string | null;
}
export interface Allocation {
  id: string;
  package_id: string;
  coach_id: string;
  balance: number;
}
export interface Payment {
  external_id?: string | null;
  id: string;
  package_id: string;
  event_id: string;
  amount: number;
  method: string;
  paid_at: string;
  status: string;
  recorded_by: string;
  verified_by: string | null;
  verified_at: string | null;
}
export interface Session {
  id: string;
  customer_id: string;
  customer_name: string;
  owning_coach_id: string;
  teaching_coach_id: string;
  recorded_by: string;
  event_id: string;
  substitution_id: string | null;
  session_at: string;
  quantity: number;
  remaining_after: number;
  notes: string | null;
}
export interface SessionAllocation {
  session_id: string;
  allocation_id: string;
  quantity: number;
  unit_price: number | null;
}
export interface CreditEvent {
  id: string;
  customer_id: string;
  actor_id: string;
  kind: string;
  reason: string | null;
  reverses_event_id: string | null;
  created_at: string;
}
export interface LedgerEntry {
  id: string;
  event_id: string;
  allocation_id: string;
  delta: number;
  balance_after: number;
  created_at: string;
}
export interface Transfer {
  id: string;
  customer_id: string;
  source_coach_id: string;
  destination_coach_id: string;
  quantity: number;
  reason: string;
  initiated_by: string;
  approved_by: string | null;
  status: string;
  event_id: string | null;
  created_at: string;
}
export interface Substitution {
  id: string;
  customer_id: string;
  owning_coach_id: string;
  teaching_coach_id: string;
  session_date: string;
  quantity: number;
  consumed: number;
  reason: string;
}
export interface Tier {
  id: string;
  name: string;
  unit_price: number;
  active: boolean;
}
export interface Audit {
  id: string;
  actor_id: string;
  action: string;
  record_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}
export interface Workspace {
  profile: Profile;
  gym: Gym;
  customers: Customer[];
  coaches: Coach[];
  profiles: Profile[];
  assignments: Assignment[];
  packages: Package[];
  allocations: Allocation[];
  payments: Payment[];
  sessions: Session[];
  sessionAllocations: SessionAllocation[];
  events: CreditEvent[];
  ledger: LedgerEntry[];
  transfers: Transfer[];
  substitutions: Substitution[];
  tiers: Tier[];
  audits: Audit[];
  threshold: number;
  substitutionContexts: {
    id: string;
    customer_id: string;
    customer_name: string;
    active: boolean;
    owning_balance: number;
  }[];
}
