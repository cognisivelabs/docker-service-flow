# docker-service-flow

A zero-config service flow visualizer for Docker microservices. Sniffs traffic directly from Docker bridge interfaces to build live sequence diagrams — no SDKs, no sidecars, no code changes.

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

If `INTERFACE` is not set, the sniffer auto-detects the user-defined Docker bridge network with the most containers (Docker's default `bridge` network is skipped).

## Features

- **Sequence Diagrams** — full request chain visualization with request and reply arrows per flow
- **Flow Correlation** — groups related calls (A→B→C→D) into a single flow, exactly when services propagate a trace or request ID, otherwise by timing
- **Flow Selector** — browse and inspect individual flows, with auto-follow for live debugging
- **Deep Packet Inspection** — HTTP method, path, headers, body, status codes, latency
- **Redirect Chains** — a browser following redirects (e.g. an OIDC login) is shown as one flow, with each `302` and where it pointed
- **Execution Logs** — ordered call table per flow; click a call to open the Request Inspector
- **Request Inspector** — request/response headers and bodies (JSON pretty-printed), copy-as-curl
- **UML Fragments** — sequence diagrams mark repeated calls (loop), concurrent calls (par) and error responses (alt)
- **Zero Config** — auto-detects Docker networks and bridge interfaces

## Dashboard

The dashboard at `http://localhost:3005` has four panels:

| Panel | Location | What it shows |
|-------|----------|---------------|
| **Flow Selector** | Left sidebar | List of captured flows, click to inspect |
| **Sequence View** | Center top | UML sequence diagram of the selected flow |
| **Execution Logs** | Center bottom | Ordered call table for the selected flow |
| **Live Feed** | Right sidebar | Real-time flow summaries |

Clicking a call in Execution Logs opens the **Request Inspector** in its place (request/response tabs, copy as cURL).

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
3. **Correlator** merges request/response pairs into calls, then groups calls into flows. A call joins:
   - the flow sharing its propagated trace/request ID (`traceparent`, `X-B3-TraceId`, `X-Request-ID` or `X-Correlation-ID`), which is exact; otherwise
   - the flow of a redirect it follows: the same client requesting a `3xx` response's `Location` within 10 seconds, or presenting the OAuth `state` from an earlier redirect within 10 minutes; otherwise
   - a request the calling service is still serving, spread evenly when several are in flight (approximate for concurrent requests); otherwise
   - a request the calling service received within the last 200ms

   Flows settle after 2 seconds without activity. Traffic from the Docker host (e.g. a browser using a published port) is shown as `host`.
4. **Server** broadcasts flows via WebSocket to the embedded React dashboard

### Redirects and OIDC logins

An OIDC authorization-code login appears as a single flow: the app's `302` to the
identity provider, the login page, the form POST and its `302` to the callback, the
callback's server-side `/token` exchange, and the final redirect. The browser shows as
`host`, and each redirect reply is labelled with where it pointed (e.g.
`302 → /callback`; the full `Location` is in the Request Inspector).

The login form's pause is bridged by the OAuth `state` parameter, which the identity
provider echoes back on the callback, so the flow continues even if the user takes
minutes to log in.

Limits: only plain-HTTP traffic on the Docker network can be read. An identity
provider behind HTTPS, or outside Docker (e.g. a cloud IdP), can't be captured.

## Architecture

Single Docker image, two roles:
- **Server** (bridge network) — correlation engine + WebSocket hub + embedded dashboard on port 3005
- **Sniffer** (host network) — packet capture with `NET_RAW`/`NET_ADMIN` capabilities, forwards events to server via HTTP

The `docker-compose.yml` runs both from the same image.

## Prerequisites

- **Docker & Docker Compose** — that's all for running it
- **Go 1.24.4+ and libpcap headers** (`libpcap-dev` on Linux; included on macOS) — only for building and testing outside Docker (uses `vendor/`, no module downloads)
- **Node.js 20.9+** — only for frontend tests and the dev server (`make frontend` builds in Docker)

## Building Behind a Package Mirror (e.g. Nexus)

**The image build needs no npm registry, Node.js or Go module proxy.** Everything
the code depends on is in the repo:

- `web/out/`: the frontend, pre-built (static HTML/JS/CSS, about 1.2 MB), embedded
  into the Go binary
- `vendor/`: the Go modules (about 7 MB, with their licences); the Go compile step
  runs with networking disabled
- `web/src/lib/react-sequence-kit/` and `web/src/app/fonts/`: the sequence diagram
  library and Geist fonts, which aren't on any public registry

The build pulls only from two kinds of public source, each of which can be pointed
at a mirror:

| Source | Used for | Override |
|--------|----------|----------|
| Docker Hub | `golang`, `alpine` base images (pinned tags) | `BASE_REGISTRY` (prefix, with trailing `/`) |
| Alpine packages | `libpcap`, `gcc`, `musl-dev` | `ALPINE_MIRROR` |

Put the overrides in a `.env` file next to `docker-compose.yml`:

```bash
BASE_REGISTRY=nexus.example.gov:8082/
ALPINE_MIRROR=https://nexus.example.gov/repository/alpine-proxy
```

then run `docker compose up -d --build` as usual. The running app makes no
outbound calls.

To build the frontend from source inside Docker instead (needs an npm registry and
the `node` base image), set `FRONTEND=build`, plus `NPM_REGISTRY` if you use a
mirror. Next.js telemetry is disabled in the image and the Makefile.

## Development

```bash
make build      # Build Go binary locally (embeds the committed web/out)
make test       # Run all tests (Go + frontend; run `npm ci` in web/ once first)
make frontend   # Rebuild web/out (in Docker) after changing web/ — commit the result
make frontend-check  # Fail if the committed web/out is stale
make vendor     # Refresh vendor/ after changing go.mod — commit the result
make up         # docker compose up -d --build
make down       # docker compose down
make clean      # Remove build artifacts and stop the containers
```

### Project Structure

```
docker-service-flow/
├── cmd/dsf/main.go              # CLI entry point (server + sniffer modes)
├── embed.go                     # Embeds frontend static files into Go binary
├── vendor/                      # Go modules (committed; refresh with make vendor)
├── internal/
│   ├── correlator/              # Flow correlation engine + tests
│   ├── discovery/               # Docker container discovery + auto-detect
│   ├── sniffer/                 # Packet capture + event forwarding
│   └── server/                  # WebSocket hub + HTTP mux
├── web/                         # Next.js frontend
│   ├── out/                     # Pre-built frontend (committed; refresh with make frontend)
│   ├── src/app/fonts/           # Bundled Geist fonts
│   ├── src/components/          # Dashboard, SequenceView, RequestInspector, etc.
│   ├── src/hooks/               # WebSocket hook
│   ├── src/utils/               # Shared utilities + tests
│   └── src/lib/react-sequence-kit/  # Vendored sequence diagram renderer
├── Dockerfile                   # Single image for both server + sniffer
├── docker-compose.yml           # Orchestrates server + sniffer
└── Makefile
```

## Tech Stack

- **Backend**: Go, gopacket (libpcap), gorilla/websocket, Docker Engine API client
- **Frontend**: Next.js, react-sequence-kit (vendored), Tailwind CSS
- **Deployment**: Single Docker image, orchestrated via Docker Compose
