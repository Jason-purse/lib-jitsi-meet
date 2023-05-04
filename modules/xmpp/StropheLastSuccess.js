/**
 * Attaches to the {@link Strophe.Connection.rawInput} which is called whenever any data is received from the server.
 *
 * 抓取所有输入 到 rawInput 上,无论从服务器上收到什么信息 ...
 */
export default class LastRequestTracker {
    /**
     * Initializes new instance.
     */
    constructor() {
        this._lastSuccess = null;
        this._lastFailedMessage = null;
    }

    /**
     * Starts tracking requests on the given connection.
     *在给定的连接上开始跟踪请求 。。。
     * @param {XmppConnection} xmppConnection - The XMPP connection which manages the given {@code stropheConnection}.
     * @param {Object} stropheConnection - Strophe connection instance.
     */
    startTracking(xmppConnection, stropheConnection) {
        // 原始输入函数 ...
        const originalRawInput = stropheConnection.rawInput;

        // 重置 ...
        stropheConnection.rawInput = (...args) => {
            const rawMessage = args[0];

            // 如果失败,设置最新失败信息...
            if (rawMessage.includes('failure')) {
                this._lastFailedMessage = rawMessage;
            }

            // It's okay to use rawInput callback only once the connection has been established, otherwise it will
            // treat 'item-not-found' or other connection error on websocket reconnect as successful stanza received.

            // 如果连接一旦建立,使用原始的回调函数  ... 否则作为 item-not-found 处理 或者ita连接错误 - 直到weboscket 重连成功 ...
            if (xmppConnection.connected) {
                this._lastSuccess = Date.now();
            }

            // 每次都手动调用  原始输入函数 ...
            originalRawInput.apply(stropheConnection, args);
        };
    }

    /**
     * Returns the last raw failed incoming message on the xmpp connection.
     *
     * @returns {string|null}
     */
    getLastFailedMessage() {
        return this._lastFailedMessage;
    }

    /**
     * Returns how many milliseconds have passed since the last successful BOSH request.
     *
     * 返回成功登录的 时间到目前为止的长度 ...
     * @returns {number|null}
     */
    getTimeSinceLastSuccess() {
        return this._lastSuccess
            ? Date.now() - this._lastSuccess
            : null;
    }
}
