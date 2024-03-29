// https://www.iana.org/assignments/websocket/websocket.xhtml#close-code-number

enum WebSocketStatusCode {
	NormalClosure = 1000,         /** Graceful disconnection */
	EndpointGoingAway = 1001,     /** Closing connection because either the server or the client is going down (e.g. browser navigating away) */
	ProtocolError = 1002,         /** Either side is terminating the connection due to a protocol error */
	UnacceptableDataType = 1003,  /** Terminating because either side received data that it can't accept or process */
	//Reserved1 = 1004,           /** Reserved. Do not use. */
	NoStatusCode = 1005,          /** MUST NOT be sent over the wire. Used internally when no status code was sent. */
	AbnormalTermination = 1006,   /** MUST NOT be sent over the wire. Used internally when the connection is closed without sending/receiving a Close frame. */
	InconsistentData = 1007,      /** Terminating because either side received data that wasn't consistent with the expected type */
	PolicyViolation = 1008,       /** Generic. Terminating because either side received a message that violated its policy */
	MessageTooBig = 1009,         /** Terminating because either side received a message that is too big to process */
	MissingExtension = 1010,      /** Client is terminating because the server didn't negotiate one or more extensions that we require */
	UnexpectedCondition = 1011,   /** Server is terminating because it encountered an unexpected condition that prevented it from fulfilling the request */
	ServiceRestart = 1012,        /** Server is terminating because it is restarting. */
	TryAgainLater = 1013,         /** Server is terminating because of some temporary condition, e.g. it is overloaded. */
	BadGateway = 1014,            /** Server is acting as a gateway and received an invalid response from the upstream server. */
	TLSFailed = 1015,             /** MUST NOT be sent over the wire. Used internally when TLS handshake fails. */
	Unauthorized = 3000,
	Forbidden = 3003

	// 4000-4999 may be used for app-specific close codes.
}

export default WebSocketStatusCode;
