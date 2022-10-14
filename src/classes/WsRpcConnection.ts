import {randomBytes} from 'crypto';
import {EventEmitter} from 'events';
import StdLib from '@doctormckay/stdlib';
import WS13, {WebSocket, State as WebSocketState} from 'websocket13';

import RpcError from './RpcError';
import WsRpcServer, {InternalServerOptions} from './WsRpcServer';

import ConnectionState from '../enums/ConnectionState';
import JsonRpcErrorCode from '../enums/JsonRpcErrorCode';
import WebSocketStatusCode from '../enums/WebSocketStatusCode';
import {JsonRpcResponse} from '../interfaces/JsonRpc';

import {DEFAULT_HANDLER} from '../index';

export default class WsRpcConnection extends EventEmitter {
	id: string;
	remoteAddress: string;
	handshakeData: object;

	_server: WsRpcServer;
	_socket: WebSocket;
	_data: object;
	_groups: string[];
	_nextMsgId: number;
	_requestHandlers: object;
	_notificationHandlers: object;
	_responseHandlers: object;
	_options: InternalServerOptions;

	constructor(server: WsRpcServer, webSocket) {
		super();

		this.remoteAddress = webSocket.remoteAddress;
		this.handshakeData = webSocket.handshakeData;
		this._server = server;
		this._socket = webSocket;
		this._data = {};
		this._groups = [];
		this._nextMsgId = 1;
		this._responseHandlers = {};

		if (this._server) {
			// Generate an ID
			do {
				this.id = randomBytes(4).toString('hex');
			} while (this._server._connections[this.id]);

			this._server._connections[this.id] = this;

			this._requestHandlers = this._server._requestHandlers;
			this._notificationHandlers = this._server._notificationHandlers;
			this._options = this._server._options;
		}

		webSocket.on('message', async (type, data) => {
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
			let isDefaultHandler = false;

			// Make sure it's a well-formed JSON-RPC object
			if (data.jsonrpc !== '2.0' || (!isRequest && !isResponse)) {
				return this._sendError(data.id || null, JsonRpcErrorCode.InvalidRequest, 'Invalid Request');
			}

			if (isRequest) {
				// If we want params to be objects, then make sure they are
				if (this._options.requireObjectParams && (typeof data.params != 'object' || data.params === null)) {
					return this._sendError(data.id || null, JsonRpcErrorCode.InvalidParams, 'Invalid params');
				}

				if (typeof data.id != 'undefined') {
					// This is a request
					let handler = this._requestHandlers[data.method];
					if (typeof handler != 'function') {
						handler = this._requestHandlers[DEFAULT_HANDLER];
						isDefaultHandler = true;

						if (typeof handler != 'function') {
							return this._sendError(data.id, JsonRpcErrorCode.MethodNotFound, 'Method not found', {method: data.method});
						}
					}

					// Invoke the handler
					try {
						let handlerArgs = [];

						if (this._server) {
							handlerArgs.push(this); // only include this if this is an incoming connection
						}
						if (isDefaultHandler) {
							handlerArgs.push(data.method); // only include method if this is the default handler
						}
						handlerArgs.push(data.params);

						let result = await handler.apply(null, handlerArgs);
						this._sendResponse(data.id, result);
					} catch (ex) {
						if (ex instanceof RpcError) {
							this._sendError(data.id, ex.code, ex.message, ex.data);
						} else {
							throw ex;
						}
					}
				} else {
					// This is a notification
					let handler = this._notificationHandlers[data.method];
					if (typeof handler != 'function') {
						handler = this._notificationHandlers[DEFAULT_HANDLER];
						isDefaultHandler = true;

						if (typeof handler != 'function') {
							return this._sendError(null, JsonRpcErrorCode.MethodNotFound, 'Method not found', {method: data.method});
						}
					}

					// Invoke the handler. No need to worry about responses or errors.
					let handlerArgs = [];

					if (this._server) {
						handlerArgs.push(this);
					}
					if (isDefaultHandler) {
						handlerArgs.push(data.method);
					}
					handlerArgs.push(data.params);

					handler.apply(null, handlerArgs);
				}
			} else if (isResponse && data.id !== null) {
				let handler = this._responseHandlers[data.id];
				if (typeof handler != 'function') {
					return this._sendError(null, JsonRpcErrorCode.InvalidResponseID, 'Invalid response message ID');
				}

				delete this._responseHandlers[data.id];
				handler(data);
			}
		});

		if (this._server) {
			webSocket.on('disconnect', (code, reason, initiatedByUs) => {
				this._server._handleDisconnect(this, code, reason, initiatedByUs);
			});

			webSocket.on('error', (err) => {
				this._server._handleDisconnect(this, WebSocketStatusCode.AbnormalTermination, err.message, false);
			});
		}

		webSocket.on('latency', (pingTime) => {
			this.emit('latency', pingTime);
		});
	}

	get server(): WsRpcServer {
		return this._server;
	}

	get state(): WebSocketState {
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
	disconnect(statusCode: WebSocketStatusCode|number, reason?: string) {
		if (this.state == ConnectionState.Open) {
			this._socket.disconnect(statusCode, reason);
		}
	}

	/**
	 * Same as TLS.TLSSocket.getPeerCertificate
	 * @param {boolean} [detailed=false]
	 * @returns {object|null}
	 */
	getPeerCertificate(detailed = false): object|null {
		return this._socket.getPeerCertificate(detailed);
	}

	/**
	 * Same as TLS.TLSSocket.getProtocol
	 * @returns {string|null}
	 */
	getSecurityProtocol(): string|null {
		return this._socket.getSecurityProtocol();
	}

	/**
	 * Send a ping to the client.
	 * @returns {Promise<number>} - Resolves when the pong is received with the number of milliseconds it took
	 */
	ping(): Promise<number> {
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
	get groups(): string[] {
		return this._groups.slice(0);
	}

	/**
	 * Join this connection to a group.
	 * @param {string} group
	 * @returns {boolean} - true if joined group successfully; false if already in group
	 */
	joinGroup(group: string): boolean {
		if (this._groups.includes(group)) {
			return false;
		}

		this._groups.push(group);
		this._server._groups[group] = this._server._groups[group] || [];
		this._server._groups[group].push(this.id);
		return true;
	}

	/**
	 * Leave this connection from a group.
	 * @param {string} group
	 * @returns {boolean} - true if left group successfully; false if not in group
	 */
	leaveGroup(group: string): boolean {
		let idx = this._groups.indexOf(group);
		if (idx == -1) {
			return false;
		}
		this._groups.splice(idx, 1);

		if (this._server._groups[group]) {
			idx = this._server._groups[group].indexOf(this.id);
			if (idx != -1) {
				this._server._groups[group].splice(idx, 1);
			}
			if (this._server._groups[group].length == 0) {
				delete this._server._groups[group];
			}
		}

		return true;
	}

	/**
	 * Send a notification. A JSON-RPC notification is a message that does not expect a response.
	 * @param {string} method
	 * @param {*} [params]
	 * @returns {boolean} - false if the connection is not open
	 */
	notify(method: string, params?: any): boolean {
		if (this.state != ConnectionState.Open) {
			return false;
		}

		if (this._options.requireObjectParams && (params === null || typeof params === 'undefined')) {
			params = {};
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
	 * @param {*} [params]
	 * @returns {Promise}
	 */
	invoke(method: string, params?: any): Promise<any> {
		return new Promise((resolve, reject) => {
			if (this._options.requireObjectParams && (params === null || typeof params === 'undefined')) {
				params = {};
			}

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
	data(key: string, value:any = undefined): any {
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
	_sendError(id: any, code: JsonRpcErrorCode|number, message: string, data = null) {
		if (this.state != ConnectionState.Open) {
			return;
		}

		let response:JsonRpcResponse = {
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
	_sendResponse(id: any, result: any) {
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
