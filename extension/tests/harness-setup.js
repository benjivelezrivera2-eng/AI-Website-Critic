window.inspectorListeners = [];
window.chrome = { runtime: { onMessage: { addListener(fn) { window.inspectorListeners.push(fn); } }, sendMessage(message, callback) { window.lastMarkerMessage = message; if(callback) callback({ success: true }); } } };
