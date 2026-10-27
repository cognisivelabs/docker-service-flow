package sniffer

import (
	"bytes"
	"compress/gzip"
	"compress/zlib"
	"encoding/json"
	"strings"
	"testing"
)

func TestParseHTTPMessage(t *testing.T) {
	tests := []struct {
		name        string
		payload     string
		wantHeaders string
		wantBody    string
	}{
		{
			name:        "plain body",
			payload:     "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{\"ok\":true}",
			wantHeaders: "Content-Type: application/json",
			wantBody:    `{"ok":true}`,
		},
		{
			name:        "body containing blank line is kept whole",
			payload:     "POST /x HTTP/1.1\r\nHost: a\r\n\r\npart1\r\n\r\npart2",
			wantHeaders: "Host: a",
			wantBody:    "part1\r\n\r\npart2",
		},
		{
			name:        "no header terminator",
			payload:     "HTTP/1.1 200 OK\r\nContent-Type: text/plain",
			wantHeaders: "",
			wantBody:    "",
		},
		{
			name:        "chunked body is decoded",
			payload:     "HTTP/1.1 200 OK\r\ntransfer-encoding: chunked\r\n\r\n5\r\nhello\r\n6\r\n world\r\n0\r\n\r\n",
			wantHeaders: "transfer-encoding: chunked",
			wantBody:    "hello world",
		},
		{
			name:        "truncated final chunk",
			payload:     "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhello\r\n10\r\npartial",
			wantHeaders: "Transfer-Encoding: chunked",
			wantBody:    "hellopartial",
		},
		{
			name:        "gzip body is summarised",
			payload:     "HTTP/1.1 200 OK\r\nContent-Encoding: gzip\r\n\r\n\x1f\x8b\x08\x00",
			wantHeaders: "Content-Encoding: gzip",
			wantBody:    "[gzip-encoded body, 4 bytes captured]",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			headers, body := parseHTTPMessage(tt.payload)
			if headers != tt.wantHeaders {
				t.Errorf("headers = %q, want %q", headers, tt.wantHeaders)
			}
			if body != tt.wantBody {
				t.Errorf("body = %q, want %q", body, tt.wantBody)
			}
		})
	}
}

func TestParseHTTPMessageTruncatesLongBody(t *testing.T) {
	long := make([]byte, maxBodyLen+100)
	for i := range long {
		long[i] = 'a'
	}
	_, body := parseHTTPMessage("HTTP/1.1 200 OK\r\n\r\n" + string(long))
	if len(body) != maxBodyLen+3 {
		t.Errorf("len(body) = %d, want %d", len(body), maxBodyLen+3)
	}
}

type captureOutput struct{ events []TrafficEvent }

func (c *captureOutput) Send(data []byte) {
	var e TrafficEvent
	if err := json.Unmarshal(data, &e); err != nil {
		panic(err)
	}
	c.events = append(c.events, e)
}

func newTestSniffer() (*Sniffer, *captureOutput) {
	out := &captureOutput{}
	return NewSniffer("test0", nil, out), out
}

func TestMessageComplete(t *testing.T) {
	tests := []struct {
		name string
		raw  string
		want bool
	}{
		{"headers not finished", "HTTP/1.1 200 OK\r\nContent-Length: 5", false},
		{"content-length satisfied", "HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nhello", true},
		{"content-length short", "HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nhel", false},
		{"chunked unfinished", "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhello\r\n", false},
		{"chunked finished", "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhello\r\n0\r\n\r\n", true},
		{"no framing", "GET / HTTP/1.1\r\nHost: a\r\n\r\n", true},
		{"over buffer cap", "HTTP/1.1 200 OK\r\nContent-Length: 999999\r\n\r\n" + strings.Repeat("a", maxBufferedLen), true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := messageComplete(tt.raw); got != tt.want {
				t.Errorf("messageComplete() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestBodyReassembledAcrossSegments(t *testing.T) {
	s, out := newTestSniffer()
	event := TrafficEvent{EventType: "response", ResponseStatus: "200"}

	s.bufferOrEmit("k", event, "HTTP/1.1 200 OK\r\nContent-Length: 11\r\n\r\n")
	if len(out.events) != 0 {
		t.Fatalf("emitted before body arrived")
	}
	s.appendToPartial("k", "hello ")
	if len(out.events) != 0 {
		t.Fatalf("emitted with partial body")
	}
	s.appendToPartial("k", "world")

	if len(out.events) != 1 {
		t.Fatalf("got %d events, want 1", len(out.events))
	}
	if got := out.events[0].ResponseBody; got != "hello world" {
		t.Errorf("body = %q, want %q", got, "hello world")
	}
	if got := out.events[0].ResponseHeaders; got != "Content-Length: 11" {
		t.Errorf("headers = %q", got)
	}
}

func TestRequestBodyReassembled(t *testing.T) {
	s, out := newTestSniffer()
	s.bufferOrEmit("k", TrafficEvent{EventType: "request"}, "POST /charge HTTP/1.1\r\nContent-Length: 2\r\n\r\n")
	s.appendToPartial("k", "{}")

	if len(out.events) != 1 || out.events[0].RequestBody != "{}" {
		t.Fatalf("events = %+v", out.events)
	}
}

func TestFlushPartialEmitsWhatWeHave(t *testing.T) {
	s, out := newTestSniffer()
	s.bufferOrEmit("k", TrafficEvent{EventType: "response"}, "HTTP/1.1 200 OK\r\nContent-Length: 100\r\n\r\npartial")
	s.flushPartial("k")
	s.flushPartial("k") // second flush is a no-op

	if len(out.events) != 1 || out.events[0].ResponseBody != "partial" {
		t.Fatalf("events = %+v", out.events)
	}
}

func TestAppendWithoutPartialIsIgnored(t *testing.T) {
	s, out := newTestSniffer()
	s.appendToPartial("unknown", "stray segment")
	if len(out.events) != 0 {
		t.Fatalf("events = %+v", out.events)
	}
}

func TestParseHTTPMessageDecompresses(t *testing.T) {
	var gz bytes.Buffer
	w := gzip.NewWriter(&gz)
	w.Write([]byte(`{"price":19.99}`))
	w.Close()

	var zl bytes.Buffer
	zw := zlib.NewWriter(&zl)
	zw.Write([]byte(`{"deflated":true}`))
	zw.Close()

	tests := []struct {
		name, encoding, body, want string
	}{
		{"gzip", "gzip", gz.String(), `{"price":19.99}`},
		{"zlib deflate", "deflate", zl.String(), `{"deflated":true}`},
		{"brotli unsupported", "br", "\x0b\x02\x80", "[br-encoded body, 3 bytes captured]"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, body := parseHTTPMessage("HTTP/1.1 200 OK\r\nContent-Encoding: " + tt.encoding + "\r\n\r\n" + tt.body)
			if body != tt.want {
				t.Errorf("body = %q, want %q", body, tt.want)
			}
		})
	}
}
