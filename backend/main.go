package main

import (
	"flag"
	"io"
	"log"
	"net/http"
	"os"

	"github.com/sachingupta/g-flow/backend/docker"
	"github.com/sachingupta/g-flow/backend/sniffer"
	"github.com/sachingupta/g-flow/backend/ws"
)

func main() {
	mode := flag.String("mode", "server", "Mode to run: 'server' or 'sniffer'")
	serverURL := flag.String("server-url", "http://backend:8085/api/events", "URL to forward events to (sniffer mode)")
	flag.Parse()

	if *mode == "server" {
		runServer()
	} else if *mode == "sniffer" {
		runSniffer(*serverURL)
	} else {
		log.Fatalf("Unknown mode: %s", *mode)
	}
}

func runServer() {
	log.Println("Starting G-Flow Server...")

	// 1. WebSocket Hub
	hub := ws.NewHub()
	go hub.Run()

	// 2. HTTP Handlers
	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		ws.ServeWs(hub, w, r)
	})

	http.HandleFunc("/api/events", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "Bad request", http.StatusBadRequest)
			return
		}
		// Broadcast to UI
		hub.Send(body)
		w.WriteHeader(http.StatusOK)
	})

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	log.Println("G-Flow Server listening on :8085")
	if err := http.ListenAndServe(":8085", nil); err != nil {
		log.Fatal(err)
	}
}

func runSniffer(serverURL string) {
	log.Println("Starting G-Flow Sniffer...")

	// 1. Docker Discovery
	discovery, err := docker.NewDiscoveryService()
	if err != nil {
		log.Fatalf("Failed to initialize discovery: %v", err)
	}
	go discovery.Start()

	// 2. Output Channel (HTTP Forwarder)
	forwarder := sniffer.NewForwarder(serverURL)

	// 3. Initialize Sniffer
	iface := os.Getenv("INTERFACE")
	if iface == "" {
		iface = "any"
	}
	log.Printf("Sniffing on interface: %s", iface)

	// Note: We don't verify discovery here as we assume it works or retries
	// In a real app we might want to sync discovery with server too, but for now
	// the sniffer does the resolution and sends fully resolved events.

	sniff := sniffer.NewSniffer(iface, discovery, forwarder)
	sniff.Start() // blocks forever
}
