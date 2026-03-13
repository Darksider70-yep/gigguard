# GigGuard — AI-Powered Income Insurance for Gig Workers

## Overview

GigGuard is an AI-driven parametric insurance platform designed to protect food delivery partners working on platforms like Zomato and Swiggy. These workers often lose income due to uncontrollable external disruptions such as heavy rainfall, extreme heat, pollution spikes, or curfews.

GigGuard automatically detects these disruptions and triggers payouts for lost working hours without requiring manual claims.

## Problem

Delivery workers depend on daily earnings ranging between ₹600–₹900. Severe environmental conditions like heavy rain or high AQI can reduce their working hours by 20–30%. Currently, there is no safety net that compensates them for these disruptions.

## Solution

GigGuard provides a weekly parametric insurance policy. When predefined environmental thresholds are crossed, the system automatically triggers a claim and sends a payout to the worker.

## Persona

Primary persona: Urban food delivery partners working for Zomato and Swiggy.

Typical characteristics:

* Earnings: ₹600–₹900 per day
* Work hours: 8–10 hours daily
* Location: Metro cities such as Delhi, Mumbai, Bangalore, Chennai, and Hyderabad
* Income cycle: Weekly payouts

## Weekly Premium Model

Premiums are calculated dynamically using risk factors related to the worker’s delivery zone and predicted environmental conditions.

Formula:

weekly_premium = base_rate × zone_multiplier × weather_multiplier × history_multiplier

Example:
Base rate = ₹35
Zone multiplier = 1.2
Weather multiplier = 1.1
History multiplier = 0.95

Weekly Premium ≈ ₹44

## Parametric Triggers

GigGuard monitors objective environmental data to determine disruptions.

Five trigger events:

1. Heavy rainfall (>15 mm/hr)
2. Severe air pollution (AQI >300)
3. Extreme heat (>44°C)
4. Flood alerts issued by authorities
5. Curfews or city-wide strikes

When thresholds are crossed, the system automatically calculates lost working hours and triggers payouts.

## AI Integration

Two machine learning models power GigGuard:

Premium Prediction Model

* Uses zone risk data and weather forecasts
* Predicts pricing multipliers

Fraud Detection Model

* Uses anomaly detection to flag suspicious claims
* Prevents duplicate claims and GPS spoofing

## Tech Stack

Frontend: Next.js + React + Tailwind
Backend: Node.js + Express
Database: PostgreSQL
Machine Learning: Python Flask + Scikit-learn
APIs: OpenWeatherMap, AQI APIs
Payments: Razorpay sandbox (simulated payouts)

## Repository Structure

The repository is divided into frontend, backend, ML services, documentation, and infrastructure components.

## Phase 1 Goal

Deliver system design, documentation, and prototype flows that demonstrate how GigGuard protects gig workers from income disruption.
