// This script runs in the context of the React app (localhost:5173)
window.addEventListener("message", (event) => {
  // We only accept messages from ourselves
  if (event.source !== window) return;

  if (event.data.type && (event.data.type === "MINUSLEARN_SYNC_TOPICS")) {
    chrome.storage.local.set({ topics: event.data.topics }, () => {
      console.log("MinusLearn Clipper: Topics synced to extension storage.");
    });
  }
}, false);

// Request topics as soon as content script loads (fixes race condition where React loaded first)
window.postMessage({ type: "MINUSLEARN_REQUEST_TOPICS" }, "*");
