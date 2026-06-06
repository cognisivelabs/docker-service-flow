package discovery

import (
	"context"
	"log"

	"github.com/moby/moby/client"
)

func DetectInterface() string {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		log.Printf("Auto-detect: cannot connect to Docker: %v", err)
		return "any"
	}

	networks, err := cli.NetworkList(context.Background(), client.NetworkListOptions{})
	if err != nil {
		log.Printf("Auto-detect: failed to list networks: %v", err)
		return "any"
	}

	var bestInterface string
	var bestContainerCount int

	for _, net := range networks.Items {
		if net.Driver != "bridge" {
			continue
		}

		if net.Name == "bridge" {
			continue
		}

		detail, err := cli.NetworkInspect(context.Background(), net.ID, client.NetworkInspectOptions{})
		if err != nil {
			continue
		}

		containerCount := len(detail.Network.Containers)
		if containerCount == 0 {
			continue
		}

		iface := "br-" + net.ID[:12]

		if bridgeName, ok := net.Options["com.docker.network.bridge.name"]; ok && bridgeName != "" {
			iface = bridgeName
		}

		log.Printf("Auto-detect: found network '%s' (%s) with %d containers", net.Name, iface, containerCount)

		if containerCount > bestContainerCount {
			bestContainerCount = containerCount
			bestInterface = iface
		}
	}

	if bestInterface != "" {
		log.Printf("Auto-detect: selected interface '%s' (%d containers)", bestInterface, bestContainerCount)
		return bestInterface
	}

	log.Println("Auto-detect: no active Docker bridge networks found, using 'any'")
	return "any"
}
