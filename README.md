# docker-service-flow

A zero-config service flow visualizer for Docker microservices. Sniffs traffic directly from Docker bridge interfaces to build live service maps and sequence diagrams — no SDKs, no sidecars, no code changes.

## Quick Start

```bash
git clone https://github.com/cognisivelabs/docker-service-flow.git
cd docker-service-flow
docker compose up -d --build
```

Open **http://localhost:3005**. That's it.

Works on Mac, Linux, and Windows — anywhere Docker runs.

## Usage

```bash
# Start
docker compose up -d --build

# Stop
docker compose down

# Specify a Docker bridge interface manually
INTERFACE=br-abc123 docker compose up -d --build
```

If `INTERFACE` is not set, the sniffer auto-detects the Docker bridge network with the most active containers.

## Features

- **Live Service Map** — auto-discovered containers with left-to-right directed graph layout (dagre)
- **Sequence Diagrams** — full request chain visualization with request and reply arrows per flow
- **Flow Correlation** — groups related calls (A→B→C→D) into a single flow using temporal heuristics
- **Flow Selector** — browse and inspect individual flows, with auto-follow for live debugging
- **Deep Packet Inspection** — HTTP method, path, headers, body, status codes, latency
- **Execution Logs** — ordered call table per flow with expandable request details
- **Zero Config** — auto-detects Docker networks and bridge interfaces

## Dashboard

The dashboard at `http://localhost:3005` has four panels:

| Panel | Location | What it shows |
|-------|----------|---------------|
| **Flow Selector** | Left sidebar | List of captured flows, click to inspect |
| **Graph / Sequence View** | Center top | Service topology graph or UML sequence diagram (toggle) |
| **Execution Logs** | Center bottom | Ordered call table for the selected flow |
| **Live Feed** | Right sidebar | Real-time flow summaries |

## How It Works

```
┌─────────────────────────────────────────────────────┐
│  Docker                                             │
│                                                     │
│  ┌───────────────────┐                              │
│  │ server            │  ← http://localhost:3005     │
│  │ • correlator      │                              │
│  │ • dashboard (UI)  │◄── POST /api/events ──┐      │
│  │ • WebSocket       │                       │      │
│  └───────────────────┘                       │      │
│                                              │      │
│  ┌───────────────────┐                       │      │
│  │ sniffer           │───────────────────────┘      │
│  │ • pcap (host net) │                              │
│  │ • Docker discovery│                              │
│  └───────┬───────────┘                              │
│          │ captures traffic                         │
│  ┌───────▼───────────────────────┐                  │
│  │ Your services                 │                  │
│  │ gateway → orders → inventory  │                  │
│  └───────────────────────────────┘                  │
└─────────────────────────────────────────────────────┘
```

1. **Sniffer** captures TCP packets on the Docker bridge using libpcap (runs in host network mode)
2. **Discovery** resolves container IPs to names via the Docker API
3. **Correlator** merges request/response pairs into calls, then groups calls into flows using a 200ms causal window
4. **Server** broadcasts flows via WebSocket to the embedded React dashboard

## Architecture

Single Docker image, two roles:
- **Server** (bridge network) — correlation engine + WebSocket hub + embedded dashboard on port 3005
- **Sniffer** (host network) — packet capture with `NET_RAW`/`NET_ADMIN` capabilities, forwards events to server via HTTP

The `docker-compose.yml` runs both from the same image.

## Prerequisites

- **Docker & Docker Compose** — that's all

## Development

```bash
make build      # Build Go binary locally (needs Go 1.24+ and Node.js 20+)
make test       # Run all tests (Go + frontend)
make up         # docker compose up -d --build
make down       # docker compose down
make clean      # Clean build artifacts
```

### Project Structure

```
docker-service-flow/
├── cmd/dsf/main.go              # CLI entry point (server + sniffer modes)
├── embed.go                     # Embeds frontend static files into Go binary
├── internal/
│   ├── correlator/              # Flow correlation engine + tests
│   ├── discovery/               # Docker container discovery + auto-detect
│   ├── sniffer/                 # Packet capture + event forwarding
│   └── server/                  # WebSocket hub + HTTP mux
├── web/                         # Next.js frontend
│   ├── src/components/          # Dashboard, FlowCanvas, SequenceView, etc.
│   ├── src/hooks/               # WebSocket hook
│   ├── src/utils/               # Shared utilities + tests
│   └── src/lib/react-sequence-kit/  # Custom sequence diagram renderer
├── Dockerfile                   # Single image for both server + sniffer
├── docker-compose.yml           # Orchestrates server + sniffer
└── Makefile
```

## Tech Stack

- **Backend**: Go, gopacket (libpcap), gorilla/websocket
- **Frontend**: Next.js, React Flow, dagre (auto-layout), Tailwind CSS
- **Deployment**: Single Docker image, orchestrated via Docker Compose
