# G-FLOW: Zero-Config Docker Service Visualizer 🚀

G-FLOw is a real-time network traffic visualizer and debugger for Docker-based microservices. It sniffs traffic directly from the Docker bridge interface to build a live service map without requiring any changes to your application code (no SDKs, no sidecars).

## Features
- **Live Service Map**: Auto-discovery of containers and real-time "pulse" animations for traffic.
- **Sequence Diagram**: Automatic generation of chronological interaction flows.
- **Deep Packet Inspection**:
  - Full Request/Response correlation.
  - Latency/Duration tracking (ms).
  - HTTP Headers and Body capture (up to 5,000 chars).
  - Status code visibility (200, 404, 500, etc.).
- **Zero-Config**: Works by sniffing raw packets on the Docker bridge (`docker0`).

---

## Prerequisites
- **Docker & Docker Compose** (Desktop or Engine).
- **MacOS/Linux** (Sniffer requires access to network interfaces).

## Quick Start

### 1. Identify the Docker Bridge Interface
G-Flow needs to know which network bridge to listen to. Run:
```bash
docker network ls
```
Then inspect your target network (usually the one your app is running on):
```bash
docker network inspect <network_name>
```
Look for the `Id` or `com.docker.network.bridge.name`. On Mac, it usually looks like `br-xxxxxx`.

### 2. Run G-Flow
Replace `br-xxxxxx` with your interface ID:
```bash
INTERFACE=br-xxxxxx docker compose up -d --build
```

### 3. Access the Dashboard
Open your browser to:
**[http://localhost:3005](http://localhost:3005)**

---

## Technical Stack
- **Backend**: Go with `gopacket` (libpcap) and Gorilla WebSockets.
- **Frontend**: Next.js 15, React Flow, Tailwind CSS, Lucide Icons.
- **Orchestration**: Docker Compose.

---

## Troubleshooting Mac Interface
If you are on Mac and the graph is empty, ensure you are using the correct `br-` interface. You can find it by running `ifconfig` on your host and looking for the bridge that gets traffic when your app is running.
