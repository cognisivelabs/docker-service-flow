# G-FLOW Feature Implementation Roadmap

This document outlines the detailed plans for the next generation of G-Flow features.

---

## 1. Performance Heatmaps & Health Monitoring
**Objective**: Instantly identify slow or failing services visually.
- **Backend**:
  - Implement a sliding window buffer (e.g., last 60 seconds) to store latencies per `Source->Destination` pair.
  - Calculate `P95` and `P99` latencies.
  - Emit an `EdgeMetric` event every 5 seconds.
- **Frontend**:
  - Use React Flow's dynamic edge styling to change color based on latency thresholds:
    - `< 100ms`: Green (Solid)
    - `100ms - 500ms`: Yellow (Dashed)
    - `> 500ms`: Red (Thick Pulse)
  - Change Node border color to Red if a service returns > 5% 5xx status codes.

## 2. Developer Debugging Tools (cURL & Replay)
**Objective**: Allow developers to easily replicate captured requests.
- **Backend**:
  - Store full request metadata (Headers/Body) in a transient Redis or In-memory ring buffer.
- **Frontend**:
  - Add a "Copy as cURL" button to the LogPanel.
  - **Replay Feature**: Add a "Resend Request" button.
    - This will trigger a `POST` from the **G-Flow Backend** (acting as a proxy) to the target container, allowing you to bypass a frontend UI for testing.

## 3. Chaos Engineering (Latency & Outage Simulation)
**Objective**: Test system resilience without modifying infra.
- **Sniffer Container Upgrade**:
  - Must run with `--cap-add=NET_ADMIN` and have `iproute2` installed.
- **Implementation**:
  - Use `tc` (Traffic Control) and `netem` to inject latency or drop packets on the bridge interface.
  - **Interactive UI**: User clicks an edge in the graph and toggles "Simulate 500ms delay".
  - Backend executes: `tc qdisc add dev <interface> root netem delay 500ms`.

## 4. Database & protocol Inspection (SQL/gRPC)
**Objective**: See what's actually in the "binary" chatter.
- **SQL Decoder**:
  - Implement a Postgre/MySQL wire protocol parser in the sniffer.
  - Extract the `Query` string from the TCP payload.
- **gRPC Decoder**:
  - Allow users to upload `.proto` files to G-Flow.
  - Use `dynamic-protobuf` to decode binary gRPC payloads into readable JSON for the execution logs.

## 5. Automated API Documentation (Auto-Swagger)
**Objective**: Generate documentation from actual usage.
- **Logic**:
  - Track every unique `Method + Path` observed.
  - Infer the JSON schema from the captured `RequestBody`.
  - Compile results into a standard `swagger.json` file.
- **UI**: Add a tab for "Auto-Documentation" where you can download the generated OpenAPI spec.

## 6. Time Travel & Incident Recording
**Objective**: Rewind and analyze past failures.
- **Backend Persistence**:
  - Introduce an optional MongoDB container to persist all `TrafficEvents`.
- **UI Controls**:
  - Add a "Record" button.
  - Add a playback slider at the bottom.
  - Sliding the bar updates the Graph and Logs to show the state of the system at that specific second.

## 7. Security & Compliance (PII Masking)
**Objective**: Prevent sensitive data leakage in dev tools.
- **Logic**:
  - Implement regex patterns for common PII (Credit cards, Emails, Auth Tokens).
  - Modify `sniffer.go` to mask these strings with `****` before they ever leave the container.

---

## 8. G-Flow Desktop (Distribution & Product Strategy)
**Objective**: Transform G-Flow from a Docker-only service into a standalone, multi-platform Desktop Application.

### Architecture: Go + Electron Sidecar
- **The Core (Go)**:
  - Compile the Go backend into a native binary for Mac (`darwin`), Windows (`windows`), and Linux (`linux`).
  - This binary acts as a "Sidecar" process managed by Electron.
- **The Wrapper (Electron)**:
  - Bundle the Next.js frontend as a static export.
  - Electron will manage the lifecycle of the Go binary (start on launch, stop on exit).
  - Handle OS-level permissions (e.g., requesting `sudo` for `pcap` access).

### Integrated Configuration UI
- **Interface Selector**: A dropdown menu displaying friendly names (e.g., "Docker Desktop Bridge") instead of cryptic interface IDs.
- **Service Filtering**: Easy toggles to include/exclude specific containers from the view.
- **Log Persistence Settings**: Configure where to save local session recordings.

### Distribution
- Bundle as `.dmg` (Mac), `.exe` (Windows), and `.deb/.rpm` (Linux) via `electron-builder`.
- Automated code signing and "Notarization" for smooth OS installation.
