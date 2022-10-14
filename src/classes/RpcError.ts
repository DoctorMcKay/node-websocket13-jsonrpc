import JsonRpcErrorCode from '../enums/JsonRpcErrorCode';

export default class RpcError extends Error {
	code: JsonRpcErrorCode|number;
	data: object;

	/**
	 *
	 * @param {string} message
	 * @param {JsonRpcErrorCode|number} code - MUST be an integer
	 * @param {object|null} data - Optional data to send along with the error
	 */
	constructor(message: string, code: JsonRpcErrorCode|number, data = null) {
		super(message);
		this.code = code;
		this.data = data;
	}
}
