package main

import (
	"flag"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	dsf "github.com/cognisivelabs/docker-service-flow"
	"github.com/cognisivelabs/docker-service-flow/internal/correlator"
	"github.com/cognisivelabs/docker-service-flow/internal/discovery"
	"github.com/cognisivelabs/docker-service-flow/internal/server"
	"github.com/cognisivelabs/docker-service-flow/internal/sniffer"
)

func main() {
	mode := flag.String("mode", "server", "Run mode: 'server' or 'sniffer'")
	port := flag.Int("port", 3005, "HTTP server port (server mode)")
	serverURL := flag.String("server-url", "", "URL to forward events to (sniffer mode)")
	iface := flag.String("interface", "", "Network interface to sniff (auto-detect if empty)")
	flag.Parse()

	switch *mode {
	case "server":
		runServer(*port)
	case "sniffer":
		runSniffer(*serverURL, *iface)
	default:
		log.Fatalf("Unknown mode: %s", *mode)
	}
}

func runServer(port int) {
	log.Println("Starting docker-service-flow server...")

	hub := server.NewHub()
	go hub.Run()

	engine := correlator.NewEngine(hub)
	hub.OnConnect = func() []byte {
		flows := engine.GetAllFlows()
		data, err := correlator.NewWSMessage("flow_list", flows)
		if err != nil {
			log.Printf("Failed to marshal flow_list: %v", err)
			return nil
		}
		return data
	}

	// Embedded frontend
	webFS, err := fs.Sub(dsf.WebFS, "web/out")
	if err != nil {
		log.Fatalf("Failed to load embedded frontend: %v", err)
	}
	mux := server.NewMux(hub, webFS)

	// /api/events — receives events from the sniffer container
	mux.HandleFunc("/api/events", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "Bad request", http.StatusBadRequest)
			return
		}
		if err := engine.HandleEvent(body); err != nil {
			http.Error(w, "Invalid event", http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusOK)
	})

	addr := fmt.Sprintf(":%d", port)
	go func() {
		log.Printf("Dashboard: http://localhost%s", addr)
		if err := http.ListenAndServe(addr, mux); err != nil {
			log.Fatalf("HTTP server failed: %v", err)
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh
	log.Println("Shutting down...")
}

func runSniffer(serverURL, iface string) {
	log.Println("Starting docker-service-flow sniffer...")

	if serverURL == "" {
		log.Fatal("--server-url is required in sniffer mode")
	}

	disc, err := discovery.NewDiscoveryService()
	if err != nil {
		log.Fatalf("Failed to initialize discovery: %v", err)
	}
	go disc.Start()

	selectedInterface := iface
	if selectedInterface == "" {
		selectedInterface = os.Getenv("INTERFACE")
	}
	if selectedInterface == "" {
		selectedInterface = discovery.DetectInterface()
	}
	if selectedInterface == "" {
		selectedInterface = "any"
	}
	log.Printf("Sniffing on interface: %s", selectedInterface)
	log.Printf("Forwarding events to: %s", serverURL)

	forwarder := sniffer.NewForwarder(serverURL)
	sniff := sniffer.NewSniffer(selectedInterface, disc, forwarder)
	if err := sniff.Start(); err != nil {
		log.Fatalf("Sniffer failed: %v", err)
	}
}
