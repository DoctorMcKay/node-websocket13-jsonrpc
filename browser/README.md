# JSON-RPC Browser WebSocket Implementation

You can pull `JsonRpcWebSocket.min.js` into your web application to connect to a JSON-RPC 2.0 WebSocket server. It will
attempt to connect using the subprotocol `jsonrpc-2.0`.

When the script is loaded, it will make a new object `JsonRpcWebSocket` available to you. This class extends `WebSocket`,
so all standard WebSocket properties and events are available. These exceptions apply:

- The constructor only accepts a `url`. The protocol is automatically set to be `jsonrpc-2.0`.
- You should not use `send()` or listen for the `message` event. Instead, use the methods listed below.

# Methods

### registerMethod(name, handler)
- `name` - String name of the method you want to register
- `handler` - A function to be invoked when the method is called
    - `params` - The params sent with the method. This may be any JSON data type, including undefined or null.
    - `respond` - A function you should call in order to respond to the method
        - `err` - If an error occurred, this must be an [`RpcError`](#rpcerror) instance. Otherwise, this must be `null`.
        - `result` - If no error occurred, this may be any data type and will be sent back as the result of this method call.

Use this method to register a new RPC method that may be called.

#### Example

```js
let rpc = new JsonRpcWebSocket('ws://127.0.0.1:8080');
rpc.registerMethod('Add', function(params, respond) {
    if (typeof params != 'object' || !Array.isArray(params) || params.length != 2 || typeof params[0] != 'number' || typeof params[1] != 'number') {
        respond(new RpcError('Invalid params', -32602));
    } else {
        respond(null, params[0] + params[1]);
    }
});
```

### registerNotification(name, handler)
- `name` - String name of the notification you want to register
- `handler` - A function to be invoked when the notification is received
    - `params` - The params sent with the notification. This may be any JSON data type, including undefined or null.

Use this method to register a new RPC notification. Notifications work the same as methods, except they cannot be
responded to.

### notify(method[, params])
- `method` - String name of the notification you want to send
- `params` - Any data type to be sent with the notification

Send a notification to the server.

### invoke(method[, params], callback)
- `method` - String name of the method you want to invoke
- `params` - Any data type to be sent with the method
- `callback` - A function to be invoked when the response is received
    - `err` - If an error occurred invoking this method, this is an `RpcError` object. Otherwise, this is `null`.
    - `result` - If no error occurred, this may be any data type and is the result of the method call.

Invoke a method on the server.

# RpcError

This class extends `Error`. Its constructor is as follows:

### RpcError(message, code[, data])
- `message` - A string error message
- `code` - A number containing an error code, which **MUST** be an integer
- `data` - Optional. Any data type to be included with the error
