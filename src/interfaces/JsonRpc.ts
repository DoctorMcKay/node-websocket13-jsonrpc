export interface JsonRpcResponse {
	jsonrpc: string;
	id?: any;
	error?: JsonRpcError;
	result?: any;
}

interface JsonRpcError {
	code: number;
	message: string;
	data?: any;
}
