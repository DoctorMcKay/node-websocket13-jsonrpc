import {EventEmitter} from 'events';
import {Server as HttpServer} from 'http';
import {Server as HttpsServer} from 'https';
import {WebSocketServer} from 'websocket13';

import WsRpcConnection from './WsRpcConnection';
import WebSocketStatusCode from '../enums/WebSocketStatusCode';

const ACTIVE_SUBPROTOCOL = 'jsonrpc-2.0';

export interface ServerOptions {
	pingInterval?: number;
	pingTimeout?: number;
	pingFailures?: number;
	permessageDeflate?: boolean;
	requireObjectParams?: boolean;
}

export interface InternalServerOptions extends ServerOptions {
	protocols?: string[];
}

export default class WsRpcServer extends EventEmitter {
	_connections: object;
	_groups: object;
	_options: InternalServerOptions;
	_requestHandlers: object;
	_notificationHandlers: object;
	_ws: WebSocketServer;

	/**
	 * @param {{pingInterval?: number, pingTimeout?: number, pingFailures?: number, permessageDeflate?: boolean, requireObjectParams?: boolean}} [options]
	 */
	constructor(options?: ServerOptions) {
		super();

		let opts:InternalServerOptions = Object.assign({}, options || {});

		this._connections = {};
		this._groups = {};
		this._options = opts;

		this._requestHandlers = {};
		this._notificationHandlers = {};

		opts.protocols = [ACTIVE_SUBPROTOCOL];
		this._ws = new WebSocketServer(opts);

		// Set up the handshake handler
		this._ws.on('handshake', (handshakeData, reject, accept) => {
			if (handshakeData.selectedProtocol != ACTIVE_SUBPROTOCOL) {
				return reject(403, 'Invalid subprotocols');
			}

			this.emit('handshake', handshakeData, reject, (response) => {
				response = response || {};
				let conn = new WsRpcConnection(this, accept({
					headers: response.headers,
					options: response.options
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
	get connections(): WsRpcConnection[] {
		return Object.values(this._connections);
	}

	/**
	 * Get all extant group names.
	 * @returns {string[]}
	 */
	get groups(): string[] {
		return Object.keys(this._groups);
	}

	/**
	 * Bind the WebSocket RPC server to a web server.
	 * @param {HttpServer|HttpsServer} server
	 */
	http(server: HttpServer|HttpsServer) {
		this._ws.http(server);
	}

	/**
	 * Get all the members of a given group or set of groups.
	 * @param {string|string[]} group - The group name or an array of group names
	 * @returns {WsRpcConnection[]}
	 */
	groupMembers(group: string|string[]): WsRpcConnection[] {
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
	registerMethod(name: string, handler) {
		this._requestHandlers[name] = handler;
	}

	/**
	 * Register a handler for an incoming notification. Notifications may not be responded to.
	 * @param {string} name
	 * @param {function} handler - Invoked with arguments (WsRpcConnection, any params)
	 */
	registerNotification(name: string, handler) {
		this._notificationHandlers[name] = handler;
	}

	/**
	 * Send a notification to a group.
	 * @param {string|string[]|null} group - Group name or set of group names to send the notification to or null to send to all.
	 * @param {string} method
	 * @param {*} [params]
	 * @return {number} Count of message recipients
	 */
	notify(group: string|string[]|null, method: string, params?: any): number {
		let recipients = group === null ? this.connections : this.groupMembers(group);
		recipients.forEach((connection) => {
			connection.notify(method, params);
		});

		return recipients.length;
	}

	/**
	 * Send a notification to all connected clients.
	 * @param {string} method
	 * @param {*} [params]
	 * @return {number} Count of message recipients
	 */
	notifyAll(method: string, params?: any): number {
		return this.notify(null, method, params);
	}

	/**
	 * @param {WsRpcConnection} connection
	 * @param {WebSocketStatusCode|number} code
	 * @param {string} reason
	 * @param {boolean} initiatedByUs
	 * @private
	 */
	_handleDisconnect(connection: WsRpcConnection, code: WebSocketStatusCode|number, reason: string, initiatedByUs: boolean) {
		this.emit('disconnect', connection, code, reason, initiatedByUs);
		connection.groups.forEach(group => connection.leaveGroup(group));
		delete this._connections[connection.id];
	}
}
