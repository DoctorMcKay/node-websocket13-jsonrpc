enum JsonRpcErrorCode {
	ParseError = -32700,
	InvalidRequest = -32600,
	MethodNotFound = -32601,
	InvalidParams = -32602,
	InternalError = -32603,

	// Implementation-defined server errors below
	InvalidResponseID = -32000
}

export default JsonRpcErrorCode;
