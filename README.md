# websocket13-jsonrpc
[![npm version](https://img.shields.io/npm/v/websocket13-jsonrpc.svg)](https://npmjs.com/package/websocket13-jsonrpc)
[![npm downloads](https://img.shields.io/npm/dm/websocket13-jsonrpc.svg)](https://npmjs.com/package/websocket13-jsonrpc)
[![license](https://img.shields.io/npm/l/websocket13-jsonrpc.svg)](https://github.com/DoctorMcKay/node-websocket13-jsonrpc/blob/master/LICENSE)
[![paypal](https://img.shields.io/badge/paypal-donate-yellow.svg)](https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=N36YVAT42CZ4G&item_name=node%2dsteam%2duser&currency_code=USD)

This is a server implementation of [JSON-RPC 2.0](https://www.jsonrpc.org/specification) over WebSockets.

A browser client implementation is available under [`browser`](https://github.com/DoctorMcKay/node-websocket13-jsonrpc/tree/master/browser).
If you want to write your own implementation, the only special consideration is that incoming connections **must** support
the subprotocol `jsonrpc-2.0`.

Please note that this server implementation does not support JSON-RPC batches, since that practically isn't useful over
a transport like WebSocket.

# Exports

The module exports the following:

- [`ConnectionState`](#connectionstate) - An enum indicating the state an individual connection is in
- [`JsonRpcErrorCode`](#jsonrpcerrorcode) - An enum containing reserved JSON-RPC error codes
- [`WebSocketStatusCode`](#websocketstatuscode) - An enum containing WebSocket closure status codes
- [`RpcError`](#rpcerror) - An extension to `Error` used for responding to RPC calls with errors
- [`WsRpcConnection`](#wsrpcconnection) - An object representing individual connections
- [`WsRpcServer`](#wsrpcserver) - An object for running a server
- [`WsRpcOutgoingConnection`](#wsrpcoutgoingconnection) - An object representing outgoing connections

# ConnectionState

[See enum here](https://github.com/DoctorMcKay/node-websocket13-jsonrpc/blob/master/enums/ConnectionState.ts)

# JsonRpcErrorCode

[See enum here](https://github.com/DoctorMcKay/node-websocket13-jsonrpc/blob/master/enums/JsonRpcErrorCode.ts)

Reserved JSON-RPC error codes [are defined here](https://www.jsonrpc.org/specification#error_object).

# WebSocketStatusCode

[See enum here](https://github.com/DoctorMcKay/node-websocket13-jsonrpc/blob/master/enums/WebSocketStatusCode.ts)

# RpcError

Constructed with 3 parameters:

- `message` - A string containing an error message
- `code` - A number containing an error code (MUST be an integer)
- `data` - An optional value of any type to be sent along with the error

### Example

```js
const {RpcError} = require('websocket13-jsonrpc2');

throw new RpcError('File not found', 100, {filename: '/root/example.txt'});
```

# WsRpcConnection

**This class is not to be instantiated directly.**

## Properties

### id

A string containing a UUIDv4 assigned to this connection.

### remoteAddress

The remote IP address.

### server

The [`WsRpcServer`](#wsrpcserver) that spawned this connection.

### state

The state of this connection. This is a value from [`ConnectionState`](#connectionstate)

### handshakeData

The data object from the `handshake` event for this connection.

### groups

An array containing the string name of each group that this connection is a member of.

## Methods

### disconnect(statusCode[, reason])
- `statusCode` - A value from [`WebSocketStatusCode`](#websocketstatuscode)
- `reason` - An optional string reason for the closure

Closes an active connection. If the connection is already closed, does nothing.

### getPeerCertificate([detailed])

Same as [`tls.TLSSocket.getPeerCertificate`](https://nodejs.org/api/tls.html#tls_tlssocket_getpeercertificate_detailed).
Returns `null` if the current connection is not secure.

### getSecurityProtocol()

Same as [`tls.TLSSocket.getProtocol`](https://nodejs.org/api/tls.html#tls_tlssocket_getprotocol).
Returns `null` if the current connection is not secure.

### data(key[, value])
- `key` - String
- `value` - Any type

Associate any arbitrary data with this connection. If `value` is undefined, returns the current value of `key`.
If `value` is defined, sets `key` to that `value` and returns the previous value.

### ping()

Sends a ping frame to the remote. Returns a Promise that is resolved with the time in milliseconds that it took to
receive the reply.

#### Example

```js
async function pingClient() {
    let latency = await client.ping();
    console.log(`Client ${client.id}'s latency is ${latency} milliseconds.`);
}
```

### joinGroup(group)
- `group` - String group name

Joins this connection to a group. Groups are used to broadcast messages to groups of connections all at once.
For example, you might put connections in a particular chat room into one group, or you might put connections
authenticated to a given user ID in a dedicated group.

Groups are ad-hoc and are created or destroyed as needed.

Returns `true` if this connection was joined to the group successfully, or `false` if it was already in the given group.

### leaveGroup(group)
- `group` - String group name

Leaves this connection from a group. If this was the last member of the group, the group is destroyed.

Returns `true` if this connection left the group successfully, or `false` if it was not in the given group.

### notify(method[, params])
- `method` - String method name
- `params` - Any data type

Sends a notification to the remote. JSON-RPC notifications are messages which may not be responded to.

Returns `true` if the notification was sent, or `false` if the connection was not open.

### invoke(method[, params])
- `method` - String method name
- `params` - Any data type

Sends a request to the remote. Returns a Promise that will be resolved with the result of the request, or rejected with
a [`RpcError`](#rpcerror) if the request fails.

## Events

### latency
- `pingTime` - Round-trip latency in milliseconds

Emitted periodically (unless you've disabled pings in options) with the latency of the connection.

# WsRpcServer

This class instantiates a WebSocket server.

The constructor takes a single `options` object:

- `requireObjectParams` - If passed and set to `true`, then incoming JSON-RPC messages will be rejected if their `params`
                          are any data type except object (not including `null`) or array. If this is enabled, it will
                          also automatically set params to `{}` if it's null or undefined.
- All other options from [`WS13.WebSocketServer`](https://github.com/DoctorMcKay/node-websocket13/wiki/WebSocketServer#options)
  are allowed, except `protocols`.

The `requireObjectParams` option is designed to allow you to do things like this without worrying about invalid incoming
params causing a crash:

```js
server.registerMethod('Add', (connection, [a, b]) => {
    return a + b;
});
```

## Events

### handshake
- `handshakeData`
- `reject`
- `accept`

Same as [websocket13's handshake event](https://github.com/DoctorMcKay/node-websocket13/wiki/WebSocketServer#handshake),
with these exceptions:

- `accept()` returns a [`WsRpcConnection`](#wsrpcconnection) instead of a `WebSocket`
- It is not possible to override `protocol` in `accept()`

**This event must be handled or else all incoming connections will stall.**

### connect
- `connection` - The [`WsRpcConnection`](#wsrpcconnection) that connected

Emitted when a new connection is established.

### disconnect
- `connection` - The [`WsRpcConnection`](#wsrpcconnection) that disconnected
- `code` - A value from [`WebSocketStatusCode`](#websocketstatuscode)
- `reason` - A string, possibly empty, describing why they disconnected
- `initiatedByUs` - A boolean indicating whether the disconnection was initiated by the server (true) or by the client (false)

Emitted when a remote disconnects.

## Properties

### connections

An array containing all currently-active [`WsRpcConnection`](#wsrpcconnection) objects.

### groups

An array containing strings of the names of all groups that currently have members.

## Methods

### http(server)
- `server` - Either an [`http.Server`](https://nodejs.org/api/http.html#http_class_http_server) or an [`https.Server`](https://nodejs.org/api/https.html#https_class_https_server)

Listen for WebSocket connections on this server. You can call this for more than one HTTP(S) server, but you shouldn't call it more than once per server. For example, if you're accepting both secure and insecure connections, you should call this once with an HTTP server, and once with an HTTPS server.

This binds to the server's `upgrade` event. If nothing else has bound to that event, then `node-websocket13` will respond to bad handshakes with an HTTP 400 response. Otherwise, it will do nothing. Bad handshakes are those which match any of the following criteria:

- `Upgrade` header does not match the value `websocket` (case-insensitively)
- `Connection` header does not contain the value `upgrade` (case-insensitively, interpreting the header value as a comma-separated list)
    - For example, `Connection: keep-alive, upgrade` is valid, but `Connection: keep-alive upgrade` is not
- Client HTTP version is not at least 1.1
- Client request method is not `GET`
- Client request is missing `Sec-WebSocket-Key` header or when base64-decoded, it is not 16 bytes in length
- Client request is missing `Sec-WebSocket-Version` header or the header's value is not `13`

### groupMembers(group)
- `group` - Either a group name or an array of group names

Returns an array of [`WsRpcConnection`](#wsrpcconnection) objects for the members in the given set of groups. If you
pass a single string, returns the list of members of that group. If you pass an array of strings, returns a de-duplicated
union of group members.

### registerMethod(name, handler)
- `name` - String method name
- `handler` - A function to be invoked when the method is called

Registers a new method. When JSON-RPC messages invoking this method are received, the `handler` will be called with the
signature `(WsRpcConnection, any params)`.

Please note that unless the `requireObjectParams` option is set, `params` can be any JSON type
(including null or undefined).

The `handler` function must return either a response value or a `Promise` which is resolved to the response value.
If an error occurs while processing this method, you must throw (or reject the `Promise` with) a [`RpcError`](#rpcerror),
which will be sent to the remote as an error response.

By default, if a method invocation is received that does not match any registered method, a method not found error will
be sent back. If you want to process unregistered methods yourself, you can use the DEFAULT_HANDLER symbol.

#### Example

```js
const {RpcError, JsonRpcErrorCode, DEFAULT_METHOD} = require('websocket13-jsonrpc2');

server.registerMethod('Add', (connection, params) => {
    if (typeof params != 'object' || !Array.isArray(params) || params.length != 2 || typeof params[0] != 'number' || typeof params[1] != 'number') {
        throw new RpcError('Invalid params', JsonRpcErrorCode.InvalidParams);    
    }
    
    return params[0] + params[1];
});

server.registerMethod('AddAsync', async (connection, params) => {
    if (typeof params != 'object' || !Array.isArray(params) || params.length != 2 || typeof params[0] != 'number' || typeof params[1] != 'number') {
        throw new RpcError('Invalid params', JsonRpcErrorCode.InvalidParams);    
    }
    
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return params[0] + params[1];
});

server.registerMethod(DEFAULT_METHOD, (connection, method, params) => {
	console.log(`Client ${connection.id} invoked unregistered method ${method} with params ${params}`);
	return 1;
});
```

### registerNotification(name, handler)
- `name` - String name
- `handler` - A function to be invoked when the notification is received

Registers a new notification. When JSON-RPC messages containing this notification are received, the `handler` will be
called with the signature `(WsRpcConnection, any params)`.

Please note that unless the `requireObjectParams` option is set, `params` can be any JSON type
(including null or undefined).

As a JSON-RPC notification requires no response, `handler` should not return anything.

You can also register a default handler for notifications in the same way as for methods.

### notify(group, name[, params])
- `group` - String name of group or array of string names of groups to send notification to. Use `null` to send a notification to all active clients.
- `name` - String name of notification to send
- `params` - Any data type

Sends a JSON-RPC notification to an entire group at once. You can also pass an array of groups to send a notification
to all members of all specified groups.

### notifyAll(name[, params])
- `name` - String name of notification to send
- `params` - Any data type

Sends a JSON-RPC notification to all connected clients.

# WsRpcOutgoingConnection

**This class extends [`WsRpcConnection`](#wsrpcconnection). Methods, properties, and events inherited from that class
are not listed below, so you should check those docs as well.**

Used to establish outgoing connections. You should instantiate a new instance of this class to establish a new outgoing
connection to a JSON-RPC server.

The constructor takes two arguments:

- `url` - The WebSocket URL you want to connect to (e.g. `ws://example.com/?some=query`)
- `options` - Optional. An object with zero or more of these properties:
    - `requireObjectParams` - If passed and set to `true`, then incoming JSON-RPC messages will be rejected if their `params`
                              are any data type except object (not including `null`) or array.
    - All other options from [`WS13.WebSocket`](https://github.com/DoctorMcKay/node-websocket13/wiki/WebSocket#options)
      are allowed, except `protocols`.
      
#### Example

```js
const {WsRpcOutgoingConnection} = require('websocket13-jsonrpc');

let conn = new WsRpcOutgoingConnection('ws://127.0.0.1:8080', {pingInterval: 30000});
```

## Properties

### server

Always `null` for outgoing connections.

### groups

Always `[]` (empty array) for outgoing connections.

## Methods

### joinGroup()

Outgoing connections cannot be joined to groups, so this method throws an Error if invoked.

### leaveGroup()

Outgoing connections cannot be joined to groups, so this method throws an Error if invoked.

### registerMethod(name, handler)
- `name` - String
- `handler` - Function

Functionally identical to [`WsRpcServer#registerMethod(name, handler)`](#registermethodname-handler).
This is how you should register methods for outgoing connections.

### registerNotification(name, handler)
- `name` - String
- `handler` - Function

Functionally identical to [`WsRpcServer#registerNotification(name, handler)`](#registernotificationname-handler).
This is how you should register notifications for outgoing connections.

## Events

### connected
- `details` - An object containing connection details. Identical to [`WS13.WebSocket#connected`](https://github.com/DoctorMcKay/node-websocket13/wiki/WebSocket#connected)

Emitted when the connection is successfully established.

### disconnected
- `code` - A value from [`WebSocketStatusCode`](#websocketstatuscode)
- `reason` - A string, possibly empty, desribing why we disconnected
- `initiatedByUs` - A boolean indicating whether the disconnected was initiated by us/the client (true) or by the server (false)

Emitted when we disconnect from the server.

### error
- `err` - An `Error` object

Emitted when a fatal error causes our connection to fail (while connecting) or be disconnected (while connected).
Under certain conditions, `err` may contain zero or more of these properties:

- `responseCode` - The HTTP status code we received if the error occurred during the handshake
- `responseText` - The HTTP status text we received if the error occurred during the handshake
- `httpVersion` - The HTTP version employed by the server if the error occurred during the handshake
- `headers` - An object containing the HTTP headers we received from the server if the error occurred during the handshake
- `expected` - A string containing the `Sec-WebSocket-Accept` value we expected to receive, if the error occurred because we didn't
- `actual` - A string containing the actual `Sec-WebSocket-Accept` value we received, if the error occurred because it didn't match what we expected
- `state` - The connection state at the time of error. Always present.
- `code` - A value from the `WS13.StatusCode` enum, if the error occurred after the WebSocket connection was established
