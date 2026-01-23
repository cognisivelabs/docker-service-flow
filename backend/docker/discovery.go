package docker

import (
	"context"
	"log"
	"sync"

	"github.com/moby/moby/api/types/events"
	"github.com/moby/moby/client"
)

type DiscoveryService struct {
	cli   *client.Client
	ipMap map[string]string
	mu    sync.RWMutex
}

func NewDiscoveryService() (*DiscoveryService, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, err
	}

	return &DiscoveryService{
		cli:   cli,
		ipMap: make(map[string]string),
	}, nil
}

func (s *DiscoveryService) Start() {
	log.Println("Discovery service started")
	s.refreshContainers()
	s.listenForEvents()
}

func (s *DiscoveryService) GetServiceName(ip string) string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if name, ok := s.ipMap[ip]; ok {
		return name
	}
	return ip
}

func (s *DiscoveryService) refreshContainers() {
	res, err := s.cli.ContainerList(context.Background(), client.ContainerListOptions{})
	if err != nil {
		log.Printf("Error listing containers: %v", err)
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	for _, c := range res.Items {
		log.Printf("Discovered container: %s (ID: %s)", c.Names, c.ID)
		s.updateIPMap(c.ID)
	}
	log.Printf("Initial discovery complete: %d units mapped", len(s.ipMap))
}

func (s *DiscoveryService) updateIPMap(containerID string) {
	result, err := s.cli.ContainerInspect(context.Background(), containerID, client.ContainerInspectOptions{})
	if err != nil {
		log.Printf("Error inspecting container %s: %v", containerID, err)
		return
	}

	name := result.Container.Name
	if len(name) > 0 && name[0] == '/' {
		name = name[1:]
	}

	if result.Container.NetworkSettings != nil {
		for _, network := range result.Container.NetworkSettings.Networks {
			ipStr := network.IPAddress.String()
			if ipStr != "" && ipStr != "invalid IP" {
				s.ipMap[ipStr] = name
				log.Printf("Mapped %s -> %s", ipStr, name)
			}
		}
	}
}

func (s *DiscoveryService) listenForEvents() {
	res := s.cli.Events(context.Background(), client.EventsListOptions{})

	for {
		select {
		case err := <-res.Err:
			log.Printf("Docker event error: %v", err)
		case msg := <-res.Messages:
			if msg.Type == events.ContainerEventType {
				switch msg.Action {
				case "start":
					s.updateIPMap(msg.Actor.ID)
				case "die", "stop":
					s.removeFromMap(msg.Actor.ID)
				}
			}
		}
	}
}

func (s *DiscoveryService) removeFromMap(containerID string) {
	// For simplicity in this demo, we can just re-read everything or inspect the container before it's gone
	// But usually, we might need to track which IPs belonged to which container ID
	s.refreshContainers()
}
