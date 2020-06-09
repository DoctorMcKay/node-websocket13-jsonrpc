const WS13 = require('websocket13');

const WsRpcConnection = require('./WsRpcConnection.js');
const WsRpcServer = require('./WsRpcServer.js');

const ACTIVE_SUBPROTOCOL = 'jsonrpc-2.0';

class WsRpcOutgoingConnection extends WsRpcConnection {
	/**
	 * Establish a new outgoing connection.
	 * @param {string} url
	 * @param {object} [options]
	 */
	constructor(url, options) {
		let opts = Object.assign({}, options || {});
		opts.protocols = [ACTIVE_SUBPROTOCOL];

		let socket = new WS13.WebSocket(url, opts);

		super(null, socket);
		this._options = opts;
		this._requestHandlers = {};
		this._notificationHandlers = {};

		socket.on('connected', (details) => {
			this.emit('connected', details);
		});

		socket.on('disconnect', (code, reason, initiatedByUs) => {
			this.emit('disconnect', code, reason, initiatedByUs);
		});

		socket.on('error', (err) => {
			this.emit('error', err);
		});
	}

	get server() {
		return null;
	}

	get groups() {
		return [];
	}

	/**
	 * @param {string} group
	 */
	joinGroup(group) {
		throw new Error('Cannot join an outgoing connection to a group.');
	}

	/**
	 * @param {string} group
	 */
	leaveGroup(group) {
		throw new Error('Cannot leave an outgoing connection from a group.');
	}

	/**
	 * Register a handler for a method.
	 * @param {string} name
	 * @param {function<Promise>} handler - A function to be invoked when the method is called.
	 * Must return a value immediately or return a Promise. Invoked with arguments (WsRpcConnection, any params)
	 */
	registerMethod(name, handler) {
		this._requestHandlers[name] = handler;
	}

	/**
	 * Register a handler for an incoming notification. Notifications may not be responded to.
	 * @param {string} name
	 * @param {function} handler - Invoked with arguments (WsRpcConnection, any params)
	 */
	registerNotification(name, handler) {
		this._notificationHandlers[name] = handler;
	}
}

module.exports = WsRpcOutgoingConnection;
