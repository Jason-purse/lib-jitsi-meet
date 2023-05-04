import { Strophe } from 'strophe.js';

import ConnectionPlugin from './ConnectionPlugin';

/**
 *  Logs raw stanzas and makes them available for download as JSON
 */
class StropheLogger extends ConnectionPlugin {
    /**
     *
     */
    constructor() {
        super();
        this.log = [];
    }

    /**
     *
     * @param connection
     */
    init(connection) {
        // 增强连接功能 .. ...
        super.init(connection);

        // 接受连接接受xml 数据
        this.connection.rawInput = this.logIncoming.bind(this);

        // 接受  发送到连接的数据
        this.connection.rawOutput = this.logOutgoing.bind(this);
    }

    /**
     *
     * @param stanza
     */
    logIncoming(stanza) {
        this.log.push([ new Date().getTime(), 'incoming', stanza ]);
    }

    /**
     *
     * @param stanza
     */
    logOutgoing(stanza) {
        this.log.push([ new Date().getTime(), 'outgoing', stanza ]);
    }
}

/**
 *
 */
export default function() {
    // 增加一个连接插件 ..
    Strophe.addConnectionPlugin('logger', new StropheLogger());
}
