package sniffer

import (
	"bytes"
	"io"
	"log"
	"net/http"
	"time"
)

type Forwarder struct {
	serverURL string
	client    *http.Client
}

func NewForwarder(serverURL string) *Forwarder {
	return &Forwarder{
		serverURL: serverURL,
		client: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

func (f *Forwarder) Send(event []byte) {
	resp, err := f.client.Post(f.serverURL, "application/json", bytes.NewBuffer(event))
	if err != nil {
		log.Printf("Error forwarding event: %v", err)
		return
	}
	io.Copy(io.Discard, resp.Body)
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		log.Printf("Error forwarding event, status: %d", resp.StatusCode)
	}
}
