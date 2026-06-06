package server

import (
	"encoding/json"
	"log"
)

// InitialDataProvider provides data to send to newly connected clients.
type InitialDataProvider func() []byte

// Hub maintains the set of active clients and broadcasts messages to the clients.
type Hub struct {
	clients    map[*Client]bool
	Broadcast  chan []byte
	register   chan *Client
	unregister chan *Client

	// Called when a new client connects to provide initial state
	OnConnect InitialDataProvider
}

func NewHub() *Hub {
	return &Hub{
		Broadcast:  make(chan []byte),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		clients:    make(map[*Client]bool),
	}
}

func (h *Hub) Run() {
	log.Println("WebSocket Hub running")
	for {
		select {
		case client := <-h.register:
			h.clients[client] = true
			if h.OnConnect != nil {
				if data := h.OnConnect(); data != nil {
					select {
					case client.send <- data:
					default:
					}
				}
			}
		case client := <-h.unregister:
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
		case message := <-h.Broadcast:
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(h.clients, client)
				}
			}
		}
	}
}

// Send broadcasts raw bytes to all clients.
func (h *Hub) Send(event []byte) {
	h.Broadcast <- event
}

// SendJSON marshals the value and broadcasts it.
func (h *Hub) SendJSON(v any) {
	data, err := json.Marshal(v)
	if err != nil {
		log.Printf("Hub: failed to marshal JSON: %v", err)
		return
	}
	h.Broadcast <- data
}
