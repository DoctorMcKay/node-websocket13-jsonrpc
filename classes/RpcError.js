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

module.exports = RpcError;
