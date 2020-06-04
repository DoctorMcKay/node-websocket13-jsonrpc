/**
 * JSON-RPC 2.0 WebSocket client
 * @author Alex Corn <alex@alexcorn.com>
 */

class JsonRpcWebSocket extends WebSocket {
	constructor(url) {
		super(url, 'jsonrpc-2.0');

		this._requestHandlers = {};
		this._notificationHandlers = {};
		this._responseHandlers = {};
		this._nextMsgId = 1;

		this.addEventListener('message', (e) => {
			if (typeof e.data != 'string') {
				this.close(1003, 'Unacceptable data type');
				return;
			}

			let data = e.data;
			try {
				data = JSON.parse(data);
			} catch (ex) {
				console.error(ex);
				this.close(1007, 'Error parsing JSON');
				return;
			}

			let isRequest = typeof data.method == 'string';
			let isResponse = typeof data.id != 'undefined' && (typeof data.result != 'undefined' || typeof data.error == 'object');

			// Make sure it's a well-formed JSON-RPC object
			if (data.jsonrpc !== '2.0' || (!isRequest && !isResponse)) {
				return this._sendError(data.id || null, -32600, 'Invalid Request');
			}

			if (isRequest) {
				if (typeof data.id != 'undefined') {
					// This is a request
					let handler = this._requestHandlers[data.method];
					if (typeof handler != 'function') {
						return this._sendError(data.id, -32601, 'Method not found', {method: data.method});
					}

					// Invoke the handler
					handler(data.params, (err, result) => {
						if (err) {
							if (err instanceof RpcError) {
								this._sendError(data.id, err.code, err.message, err.data);
							} else {
								throw err;
							}
						} else {
							this._sendResponse(data.id, result);
						}
					});
				} else {
					// This is a notification
					let handler = this._notificationHandlers[data.method];
					if (typeof handler != 'function') {
						return this._sendError(null, -32601, 'Method not found', {method: data.method});
					}

					// Invoke the handler. No need to worry about responses or errors.
					handler(data.params);
				}
			} else if (isResponse && data.id !== null) {
				let handler = this._responseHandlers[data.id];
				if (typeof handler != 'function') {
					return this._sendError(null, -32000, 'Invalid response message ID');
				}

				delete this._responseHandlers[data.id];
				handler(data);
			}
		});
	}

	get _open() {
		return this.readyState == WebSocket.OPEN;
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
		if (!this._open) {
			return;
		}

		let response = {
			jsonrpc: '2.0',
			error: {
				code,
				message
			},
			id
		};

		if (data) {
			response.error.data = data;
		}

		this.send(JSON.stringify(response));
	}

	/**
	 * Send a success response.
	 * @param {*} id
	 * @param {*} result
	 * @private
	 */
	_sendResponse(id, result) {
		if (!this._open) {
			return;
		}

		this.send(JSON.stringify({
			jsonrpc: '2.0',
			result,
			id
		}));
	}

	/**
	 * Register a handler for a method.
	 * @param {string} name
	 * @param {function} handler - A function to be invoked when the method is called.
	 * Called with signature (any params, function respond)
	 * respond is a function with signature (RpcError|null err, any result)
	 */
	registerMethod(name, handler) {
		this._requestHandlers[name] = handler;
	}

	/**
	 * Register a handler for an incoming notification. Notifications may not be responded to.
	 * @param {string} name
	 * @param {function} handler - Invoked with arguments (any params)
	 */
	registerNotification(name, handler) {
		this._notificationHandlers[name] = handler;
	}

	/**
	 * Send a notification. A JSON-RPC notification is a message that does not expect a response.
	 * @param {string} method
	 * @param {*} [params]
	 * @returns {boolean} - false if the connection is not open
	 */
	notify(method, params) {
		if (!this._open) {
			return false;
		}

		this.send(JSON.stringify({
			jsonrpc: '2.0',
			method,
			params
		}));

		return true;
	}

	/**
	 * Invoke a method.
	 * @param {string} method
	 * @param {*} [params]
	 * @param {function} callback - Called with signature (RpcError|null err, any result)
	 * @returns {boolean} - false if the connection is not open
	 */
	invoke(method, params, callback) {
		if (!this._open) {
			return false;
		}

		if (typeof params == 'function') {
			callback = params;
			params = undefined;
		}

		let id = this._nextMsgId++;
		this.send(JSON.stringify({
			jsonrpc: '2.0',
			method,
			params,
			id
		}));

		this._responseHandlers[id] = (response) => {
			if (response.error) {
				return callback(new RpcError(response.error.message, response.error.code, response.error.data));
			} else {
				return callback(null, response.result);
			}
		};

		return true;
	}
}

class RpcError extends Error {
	/**
	 *
	 * @param {string} message
	 * @param {JsonRpcErrorCode|number} code - MUST be an integer
	 * @param {object|null} data - Optional data to send along with the error
	 */
	constructor(message, code, data = null) {
		super(message);
		this.code = code;
		this.data = data;
	}
}
