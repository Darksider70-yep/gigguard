-- Day 1: Initial database schema with H3-ready structure

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Workers table: Stores delivery platform workers (Zomato/Swiggy partners)
CREATE TABLE IF NOT EXISTS workers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL,
  zone VARCHAR(255),  -- Legacy text-based zone, will be migrated away
  platform VARCHAR(50) NOT NULL CHECK (platform IN ('zomato', 'swiggy')),
  avg_daily_earning DECIMAL(10, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Policies table: Insurance policies for workers
CREATE TABLE IF NOT EXISTS policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  zone VARCHAR(255),  -- Legacy text-based zone
  coverage_amount DECIMAL(12, 2) NOT NULL,
  week_start DATE NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Disruption events table: Records of weather/environmental disruption events
CREATE TABLE IF NOT EXISTS disruption_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trigger_type VARCHAR(100) NOT NULL,
  city VARCHAR(100) NOT NULL,
  zone VARCHAR(255),  -- Legacy text-based zone
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  affected_worker_count INTEGER DEFAULT 0,
  total_payout DECIMAL(15, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes on commonly queried fields
CREATE INDEX idx_workers_city ON workers(city);
CREATE INDEX idx_workers_platform ON workers(platform);
CREATE INDEX idx_policies_worker_id ON policies(worker_id);
CREATE INDEX idx_disruption_events_city ON disruption_events(city);
CREATE INDEX idx_disruption_events_created_at ON disruption_events(created_at);
