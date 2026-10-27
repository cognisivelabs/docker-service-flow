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
- **Execution Logs** — ordered call table per flow; click a call to open the Request Inspector
- **Request Inspector** — request/response headers and bodies (JSON pretty-printed), copy-as-curl
- **UML Fragments** — sequence diagrams mark repeated calls (loop), concurrent calls (par) and error responses (alt)
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

- **Docker & Docker Compose** — that's all for running it
- **Go 1.24.4+ and Node.js 20.9+** — only for building and testing outside Docker

## Building Behind a Package Mirror (e.g. Nexus)

Everything not available from public package registries is in the repo: the
sequence diagram library is vendored in `web/src/lib/react-sequence-kit/` and the
Geist fonts are bundled in `web/src/app/fonts/` (no Google Fonts fetch at build
time). Everything else comes from four kinds of public source, each of which can
be pointed at a mirror:

| Source | Used for | Override |
|--------|----------|----------|
| Docker Hub | `node`, `golang`, `alpine` base images (pinned tags) | `BASE_REGISTRY` (prefix, with trailing `/`) |
| npm registry | frontend packages (`web/package-lock.json`) | `NPM_REGISTRY` |
| Go module proxy | backend modules (`go.sum`) | `GOPROXY`, `GOSUMDB` (`off` if unreachable) |
| Alpine packages | `libpcap`, `gcc`, `musl-dev` | `ALPINE_MIRROR` |

Put the overrides in a `.env` file next to `docker-compose.yml`:

```bash
BASE_REGISTRY=nexus.example.gov:8082/
NPM_REGISTRY=https://nexus.example.gov/repository/npm-proxy/
GOPROXY=https://nexus.example.gov/repository/go-proxy/
GOSUMDB=off
ALPINE_MIRROR=https://nexus.example.gov/repository/alpine-proxy
```

then run `docker compose up -d --build` as usual. For builds outside Docker,
configure npm (`npm config set registry …`) and Go (`GOPROXY`, `GOSUMDB`)
the same way. Next.js telemetry is disabled in the image and the Makefile, and
the running app makes no outbound calls.

## Development

```bash
make build      # Build Go binary locally (needs Go 1.24+ and Node.js 20+)
make test       # Run all tests (Go + frontend)
make frontend   # Build the static frontend into web/out
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
│   └── src/lib/react-sequence-kit/  # Vendored sequence diagram renderer
├── Dockerfile                   # Single image for both server + sniffer
├── docker-compose.yml           # Orchestrates server + sniffer
└── Makefile
```

## Tech Stack

- **Backend**: Go, gopacket (libpcap), gorilla/websocket
- **Frontend**: Next.js, React Flow, dagre (auto-layout), react-sequence-kit (vendored), Tailwind CSS
- **Deployment**: Single Docker image, orchestrated via Docker Compose
