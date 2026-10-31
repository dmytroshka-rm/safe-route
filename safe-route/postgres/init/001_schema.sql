CREATE TYPE recovery_case_state AS ENUM (
  'NEW', 'AT_RISK', 'OPTIONS_READY', 'PROPOSAL_READY',
  'HOLD_ACTIVE', 'AWAITING_PASSENGER_CONFIRMATION', 'REBOOKED',
  'HOLD_EXPIRED', 'ESCALATED', 'RESOLVED'
);

CREATE TYPE reservation_state AS ENUM ('HOLD_ACTIVE', 'REBOOKED', 'HOLD_EXPIRED', 'FAILED');

CREATE TABLE country_profiles (
  country_code TEXT PRIMARY KEY,
  allowed_categories JSONB NOT NULL,
  allowed_modes JSONB NOT NULL,
  labels JSONB NOT NULL
);

CREATE TABLE bookings (
  booking_id TEXT PRIMARY KEY,
  passenger_id TEXT NOT NULL,
  itinerary JSONB NOT NULL,
  booking_revision INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE recovery_cases (
  case_id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(booking_id),
  country_code TEXT NOT NULL REFERENCES country_profiles(country_code),
  state recovery_case_state NOT NULL,
  correlation_id TEXT NOT NULL UNIQUE,
  escalation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE passenger_sessions (
  session_id TEXT PRIMARY KEY,
  passenger_id TEXT NOT NULL,
  case_id TEXT NOT NULL REFERENCES recovery_cases(case_id),
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE operator_sessions (
  session_id TEXT PRIMARY KEY,
  operator_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('support_agent', 'support_lead')),
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE recovery_constraints (
  case_id TEXT PRIMARY KEY REFERENCES recovery_cases(case_id),
  desired_arrival TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE disruption_events (
  event_id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES recovery_cases(case_id),
  category TEXT NOT NULL,
  predicted_arrival TIMESTAMPTZ NOT NULL,
  source_revision INTEGER NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  UNIQUE (case_id, source_revision)
);

CREATE TABLE recovery_options (
  option_id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES recovery_cases(case_id),
  mode TEXT NOT NULL CHECK (mode IN ('train', 'bus', 'overnight')),
  itinerary JSONB NOT NULL,
  conditions TEXT NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity >= 0),
  option_revision INTEGER NOT NULL DEFAULT 1,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE reservations (
  reservation_id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES recovery_cases(case_id),
  option_id TEXT NOT NULL REFERENCES recovery_options(option_id),
  state reservation_state NOT NULL,
  expected_booking_revision INTEGER NOT NULL,
  expected_option_revision INTEGER NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  rebook_idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_entries (
  audit_id BIGSERIAL PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES recovery_cases(case_id),
  correlation_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL CHECK (actor IN ('system', 'passenger', 'agent')),
  safe_summary JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX audit_entries_case_created_idx ON audit_entries(case_id, created_at);
CREATE INDEX recovery_options_case_idx ON recovery_options(case_id);
