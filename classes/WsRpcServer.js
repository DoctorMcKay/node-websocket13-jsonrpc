const {EventEmitter} = require('events');
const WS13 = require('websocket13');

const WsRpcConnection = require('./WsRpcConnection.js');

const ACTIVE_SUBPROTOCOL = 'jsonrpc-2.0';

class WsRpcServer extends EventEmitter {
	/**
	 * @param {{pingInterval?: number, pingTimeout?: number, pingFailures?: number, permessageDeflate?: boolean, requireObjectParams?: boolean}} [options]
	 */
	constructor(options) {
		super();

		let opts = Object.assign({}, options || {});

		this._connections = {};
		this._groups = {};
		this._options = opts;

		this._requestHandlers = {};
		this._notificationHandlers = {};

		opts.protocols = [ACTIVE_SUBPROTOCOL];
		this._ws = new WS13.WebSocketServer(opts);

		// Set up the handshake handler
		this._ws.on('handshake', (handshakeData, reject, accept) => {
			if (handshakeData.selectedProtocol != ACTIVE_SUBPROTOCOL) {
				return reject(403, 'Invalid subprotocols');
			}

			this.emit('handshake', handshakeData, reject, (response) => {
				response = response || {};
				let conn = new WsRpcConnection(this, accept({
					headers: response.headers,
					options: response.options,
					extensions: response.extensions
				}));
				setImmediate(() => {
					this.emit('connect', conn);
				});
				return conn;
			});
		});
	}

	/**
	 * Get all currently-active connections.
	 * @returns {WsRpcConnection[]}
	 */
	get connections() {
		return Object.values(this._connections);
	}

	/**
	 * Get all extant group names.
	 * @returns {string[]}
	 */
	get groups() {
		return Object.keys(this._groups);
	}

	/**
	 * Bind the WebSocket RPC server to a web server.
	 * @param {HTTP.Server|HTTPS.Server} server
	 */
	http(server) {
		this._ws.http(server);
	}

	/**
	 * Get all the members of a given group or set of groups.
	 * @param {string|string[]} group - The group name or an array of group names
	 * @returns {WsRpcConnection[]}
	 */
	groupMembers(group) {
		let ids = {};
		if (!Array.isArray(group)) {
			group = [group];
		}

		group.forEach((groupName) => {
			(this._groups[groupName] || []).forEach(id => ids[id] = true);
		});

		return Object.keys(ids).map(id => this._connections[id]);
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

	/**
	 * Send a notification to a group.
	 * @param {string|string[]|null} group - Group name or set of group names to send the notification to or null to send to all.
	 * @param {string} method
	 * @param {*} [params]
	 */
	notify(group, method, params) {
		(group === null ? this.connections : this.groupMembers(group)).forEach((connection) => {
			connection.notify(method, params);
		});
	}

	/**
	 * Send a notification to all connected clients.
	 * @param {string} method
	 * @param {*} [params]
	 */
	notifyAll(method, params) {
		return this.notify(null, method, params);
	}

	/**
	 * @param {WsRpcConnection} connection
	 * @param {WebSocketStatusCode|number} code
	 * @param {string} reason
	 * @param {boolean} initiatedByUs
	 * @private
	 */
	_handleDisconnect(connection, code, reason, initiatedByUs) {
		this.emit('disconnect', connection, code, reason, initiatedByUs);
		connection.groups.forEach(group => connection.leaveGroup(group));
		delete this._connections[connection.id];
	}
}

module.exports = WsRpcServer;
