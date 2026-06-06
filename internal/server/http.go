package server

import (
	"io/fs"
	"net/http"
)

func NewMux(hub *Hub, webFS fs.FS) *http.ServeMux {
	mux := http.NewServeMux()

	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		ServeWs(hub, w, r)
	})

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	fileServer := http.FileServer(http.FS(webFS))
	mux.Handle("/", fileServer)

	return mux
}
