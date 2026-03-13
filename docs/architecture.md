# GigGuard System Architecture

GigGuard follows a microservice architecture composed of four major components.

Frontend Application
The worker interface is built with Next.js. Workers can register, purchase weekly policies, and track claims.

Backend API
A Node.js Express service manages policies, workers, claims, and payouts.

Machine Learning Service
A Python Flask microservice hosts models used for premium calculation and fraud detection.

Database
PostgreSQL stores workers, policies, claims, payouts, and disruption events.

External Integrations
Weather and air quality APIs provide environmental data used for parametric triggers.

Trigger Engine
A monitoring service runs periodically and checks whether environmental conditions exceed predefined thresholds. If a threshold is crossed, the engine automatically creates claims for all affected workers.

Data Flow

Worker registers → policy created → monitoring engine checks disruptions → trigger detected → claim created → fraud check → payout processed.

This architecture allows automated, transparent, and scalable insurance protection for gig workers.
