import RpcError from './classes/RpcError';
import WsRpcConnection from './classes/WsRpcConnection';
import WsRpcOutgoingConnection from './classes/WsRpcOutgoingConnection';
import WsRpcServer from './classes/WsRpcServer';

import ConnectionState from './enums/ConnectionState';
import JsonRpcErrorCode from './enums/JsonRpcErrorCode';
import WebSocketStatusCode from './enums/WebSocketStatusCode';

const DEFAULT_HANDLER = Symbol('default handler');

export {
	RpcError,
	WsRpcConnection,
	WsRpcOutgoingConnection,
	WsRpcServer,

	ConnectionState,
	JsonRpcErrorCode,
	WebSocketStatusCode,

	DEFAULT_HANDLER
};
