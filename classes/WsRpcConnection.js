const Crypto = require('crypto');
const StdLib = require('@doctormckay/stdlib');
const WS13 = require('websocket13');

const RpcError = require('../classes/RpcError.js');

const ConnectionState = require('../enums/ConnectionState.js');
const JsonRpcErrorCode = require('../enums/JsonRpcErrorCode.js');
const WebSocketStatusCode = require('../enums/WebSocketStatusCode.js');

class WsRpcConnection {
	/**
	 * @param {WsRpcServer} server
	 * @param {WS13.WebSocket} socket
	 */
	constructor(server, socket) {
		this.server = server;
		this.remoteAddress = socket.remoteAddress;
		this._socket = socket;
		this._data = {};
		this._groups = [];
		this._nextMsgId = 1;
		this._responseHandlers = {};

		// Generate an ID
		do {
			this.id = Crypto.randomBytes(4).toString('hex');
		} while (this.server._connections[this.id]);

		this.server._connections[this.id] = this;

		socket.on('message', async (type, data) => {
			if (type != WS13.FrameType.Data.Text) {
				this.disconnect(WS13.StatusCode.UnacceptableDataType, 'Received invalid frame type');
				return;
			}

			try {
				data = JSON.parse(data);
			} catch (ex) {
				return this._sendError(null, JsonRpcErrorCode.ParseError, 'Parse error');
			}

			let isRequest = typeof data.method == 'string';
			let isResponse = typeof data.id != 'undefined' && (typeof data.result != 'undefined' || typeof data.error == 'object');

			// Make sure it's a well-formed JSON-RPC object
			if (data.jsonrpc !== '2.0' || (!isRequest && !isResponse)) {
				return this._sendError(data.id || null, JsonRpcErrorCode.InvalidRequest, 'Invalid Request');
			}

			if (isRequest) {
				// If we want params to be objects, then make sure they are
				if (this.server._options.requireObjectParams && (typeof data.params != 'object' || data.params === null)) {
					return this._sendError(data.id || null, JsonRpcErrorCode.InvalidParams, 'Invalid params');
				}

				if (typeof data.id != 'undefined') {
					// This is a request
					let handler = this.server._requestHandlers[data.method];
					if (typeof handler != 'function') {
						return this._sendError(data.id, JsonRpcErrorCode.MethodNotFound, 'Method not found');
					}

					// Invoke the handler
					try {
						this._sendResponse(data.id, await handler(this, data.params));
					} catch (ex) {
						if (ex instanceof RpcError) {
							this._sendError(data.id, ex.code, ex.message, ex.data);
						} else {
							throw ex;
						}
					}
				} else {
					// This is a notification
					let handler = this.server._notificationHandlers[data.method];
					if (typeof handler != 'function') {
						return this._sendError(undefined, JsonRpcErrorCode.MethodNotFound, 'Method not found');
					}

					// Invoke the handler. No need to worry about responses or errors.
					handler(this, data.params);
				}
			} else if (isResponse) {
				let handler = this._responseHandlers[data.id];
				if (typeof handler != 'function') {
					return this._sendError(undefined, JsonRpcErrorCode.InvalidResponseID, 'Invalid response message ID');
				}

				delete this._responseHandlers[data.id];
				handler(data);
			}
		});

		socket.on('disconnect', (code, reason, initiatedByUs) => {
			this.server._handleDisconnect(this, code, reason, initiatedByUs);
		});

		socket.on('error', (err) => {
			this.server._handleDisconnect(this, WebSocketStatusCode.AbnormalTermination, err.message, false);
		});
	}

	get state() {
		switch (this._socket.state) {
			case WS13.State.Closed:
			case WS13.State.Connecting: // this state should not be possible since we are a server
				return ConnectionState.Closed;

			case WS13.State.Connected:
				return ConnectionState.Open;

			case WS13.State.Closing:
			case WS13.State.ClosingError:
				return ConnectionState.Closing;
		}
	}

	/**
	 * Close this connection gracefully.
	 * @param {WebSocketStatusCode|number} statusCode
	 * @param {string} [reason]
	 */
	disconnect(statusCode, reason) {
		if (this.state == ConnectionState.Open) {
			this._socket.disconnect(statusCode, reason);
		}
	}

	/**
	 * Same as TLS.TLSSocket.getPeerCertificate
	 * @param {boolean} [detailed=false]
	 * @returns {object|null}
	 */
	getPeerCertificate(detailed = false) {
		return this._socket.getPeerCertificate(detailed);
	}

	/**
	 * Same as TLS.TLSSocket.getProtocol
	 * @returns {string|null}
	 */
	getSecurityProtocol() {
		return this._socket.getSecurityProtocol();
	}

	/**
	 * Send a ping to the client.
	 * @returns {Promise<number>} - Resolves when the pong is received with the number of milliseconds it took
	 */
	ping() {
		if (this.state != ConnectionState.Open) {
			throw new Error('Cannot send ping on a connection that is not open');
		}

		return StdLib.Promises.timeoutPromise(10000, (resolve) => {
			let start = Date.now();
			this._socket.sendPing(() => {
				resolve(Date.now() - start);
			});
		});
	}

	/**
	 * Get the groups to which this connection belongs.
	 * @returns {string[]}
	 */
	get groups() {
		return this._groups.slice(0);
	}

	/**
	 * Join this connection to a group.
	 * @param {string} group
	 * @returns {boolean} - true if joined group successfully; false if already in group
	 */
	joinGroup(group) {
		if (this._groups.includes(group)) {
			return false;
		}

		this._groups.push(group);
		this.server._groups[group] = this.server._groups[group] || [];
		this.server._groups[group].push(this.id);
		return true;
	}

	/**
	 * Leave this connection from a group.
	 * @param {string} group
	 * @returns {boolean} - true if left group successfully; false if not in group
	 */
	leaveGroup(group) {
		let idx = this._groups.indexOf(group);
		if (idx == -1) {
			return false;
		}
		this._groups.splice(idx, 1);

		if (this.server._groups[group]) {
			idx = this.server._groups[group].indexOf(this.id);
			if (idx != -1) {
				this.server._groups[group].splice(idx, 1);
			}
			if (this.server._groups[group].length == 0) {
				delete this.server._groups[group];
			}
		}

		return true;
	}

	/**
	 * Send a notification. A JSON-RPC notification is a message that does not expect a response.
	 * @param {string} method
	 * @param {*} params
	 * @returns {boolean} - false if the connection is not open
	 */
	notify(method, params) {
		if (this.state != ConnectionState.Open) {
			return false;
		}

		this._socket.send(JSON.stringify({
			jsonrpc: '2.0',
			method,
			params
		}));

		return true;
	}

	/**
	 * Invoke a method.
	 * @param {string} method
	 * @param {*} params
	 * @returns {Promise}
	 */
	invoke(method, params) {
		return new Promise((resolve, reject) => {
			let id = this._nextMsgId++;
			this._socket.send(JSON.stringify({
				jsonrpc: '2.0',
				id,
				method,
				params
			}));

			this._responseHandlers[id] = (response) => {
				if (response.error) {
					return reject(new RpcError(response.error.message, response.error.code, response.error.data));
				} else {
					return resolve(response.result);
				}
			};
		});
	}

	/**
	 * Retrieve or set arbitrary user data on a connection.
	 * @param {string} key
	 * @param {*} value - If undefined, retrieves data value. If any other value, sets data value.
	 * @returns {*}
	 */
	data(key, value = undefined) {
		return this._socket.data(key, value);
	}

	/**
	 * Send an error response.
	 * @param {*} id
	 * @param {JsonRpcErrorCode|number} code
	 * @param {string} message
	 * @param {object|null} data
	 * @private
	 */
	_sendError(id, code, message, data = null) {
		if (this.state != ConnectionState.Open) {
			return;
		}

		let response = {
			jsonrpc: '2.0',
			id,
			error: {
				code,
				message
			}
		};
		if (data) {
			response.error.data = data;
		}

		this._socket.send(JSON.stringify(response));
	}

	/**
	 * Send a success response.
	 * @param {*} id
	 * @param {*} result
	 * @private
	 */
	_sendResponse(id, result) {
		if (this.state != ConnectionState.Open) {
			return;
		}

		this._socket.send(JSON.stringify({
			jsonrpc: '2.0',
			id,
			result
		}));
	}
}

module.exports = WsRpcConnection;
