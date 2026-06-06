package correlator

import (
	"encoding/json"
	"time"
)

type Call struct {
	CallID         string    `json:"callId"`
	FlowID         string    `json:"flowId"`
	Source         string    `json:"source"`
	Destination    string    `json:"destination"`
	Method         string    `json:"method"`
	Path           string    `json:"path"`
	Status         string    `json:"status"`
	DurationMs     int64     `json:"durationMs"`
	StartTime      time.Time `json:"startTime"`
	EndTime        time.Time `json:"endTime,omitempty"`
	Order          int       `json:"order"`
	RequestHeaders string    `json:"requestHeaders,omitempty"`
	RequestBody    string    `json:"requestBody,omitempty"`

	// Internal fields for TCP correlation (not sent to frontend)
	SrcIP   string `json:"-"`
	SrcPort string `json:"-"`
	DstIP   string `json:"-"`
	DstPort string `json:"-"`
}

type Flow struct {
	FlowID    string    `json:"flowId"`
	RootCall  string    `json:"rootCall"`
	Calls     []*Call   `json:"calls"`
	Services  []string  `json:"services"`
	StartTime time.Time `json:"startTime"`
	UpdatedAt time.Time `json:"updatedAt"`
	Status    string    `json:"status"` // "active" or "complete"
}

type WSMessage struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

func NewWSMessage(msgType string, payload interface{}) ([]byte, error) {
	p, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	msg := WSMessage{
		Type:    msgType,
		Payload: p,
	}
	return json.Marshal(msg)
}
