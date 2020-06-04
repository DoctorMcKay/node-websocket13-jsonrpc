# websocket13-jsonrpc
[![npm version](https://img.shields.io/npm/v/websocket13-jsonrpc.svg)](https://npmjs.com/package/websocket13-jsonrpc)
[![npm downloads](https://img.shields.io/npm/dm/websocket13-jsonrpc.svg)](https://npmjs.com/package/websocket13-jsonrpc)
[![dependencies](https://img.shields.io/david/DoctorMcKay/node-websocket13-jsonrpc.svg)](https://david-dm.org/DoctorMcKay/node-websocket13-jsonrpc)
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

# ConnectionState

[See enum here](https://github.com/DoctorMcKay/node-websocket13-jsonrpc/blob/master/enums/ConnectionState.js)

# JsonRpcErrorCode

[See enum here](https://github.com/DoctorMcKay/node-websocket13-jsonrpc/blob/master/enums/JsonRpcErrorCode.js)

Reserved JSON-RPC error codes [are defined here](https://www.jsonrpc.org/specification#error_object).

# WebSocketStatusCode

[See enum here](https://github.com/DoctorMcKay/node-websocket13-jsonrpc/blob/master/enums/WebSocketStatusCode.js)

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

A string containing a random ID assigned to this connection. Connection IDs are guaranteed unique for any given set
of active connections, but once a connection is closed its ID can be reused immediately.

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

# WsRpcServer

This class instantiates a WebSocket server.

The constructor takes a single `options` object:

- `requireObjectParams` - If passed and set to `true`, then incoming JSON-RPC messages will be rejected if their `params`
are any data type except object (not including `null`) or array.
- All other options from [`WS13.WebSocketServer`](https://github.com/DoctorMcKay/node-websocket13/wiki/WebSocketServer#options) are allowed, except `protocols`.

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

#### Example

```js
const {RpcError, JsonRpcErrorCode} = require('websocket13-jsonrpc2');

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
```

### registerNotification(name, handler)
- `name` - String name
- `handler` - A function to be invoked when the notification is received

Registers a new notification. When JSON-RPC messages containing this notification are received, the `handler` will be
called with the signature `(WsRpcConnection, any params)`.

Please note that unless the `requireObjectParams` option is set, `params` can be any JSON type
(including null or undefined).

As a JSON-RPC notification requires no response, `handler` should not return anything.

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
