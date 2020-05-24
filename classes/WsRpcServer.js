const {EventEmitter} = require('events');
const WS13 = require('websocket13');

const WsRpcConnection = require('./WsRpcConnection.js');

const ACTIVE_SUBPROTOCOL = 'jsonrpc-2.0';

class WsRpcServer extends EventEmitter {
	constructor(options) {
		super();

		this._connections = {};
		this._groups = {};
		this._options = options;

		this._requestHandlers = {};
		this._notificationHandlers = {};

		let opts = Object.assign({}, options);
		opts.protocols = [ACTIVE_SUBPROTOCOL];
		this._ws = new WS13.WebSocketServer(opts);

		// Set up the handshake handler
		this._ws.on('handshake', (handshakeData, reject, accept) => {
			if (handshakeData.selectedProtocol != ACTIVE_SUBPROTOCOL) {
				return reject(403, 'Invalid subprotocols');
			}

			this.emit('handshake', handshakeData, reject, (response) => {
				response = response || {};
				return new WsRpcConnection(this, accept({
					headers: response.headers,
					options: response.options,
					extensions: response.extensions
				}));
			});
		});
	}

	/**
	 * Bind the WebSocket RPC server to a web server.
	 * @param {HTTP.Server|HTTPS.Server} server
	 */
	http(server) {
		this._ws.http(server);
	}

	/**
	 * Register a handler for a method.
	 * @param {string} name
	 * @param {function<Promise>} handler - A function to be invoked when the method is called. Must return a Promise. Invoked with arguments (WsRpcConnection, Object params)
	 */
	registerMethod(name, handler) {
		this._requestHandlers[name] = handler;
	}

	/**
	 * Register a handler for an incoming notification. Notifications may not be responded to.
	 * @param {string} name
	 * @param {function} handler - Invoked with arguments (WsRpcConnection, Object params)
	 */
	registerNotification(name, handler) {
		this._notificationHandlers[name] = handler;
	}
}

module.exports = WsRpcServer;
