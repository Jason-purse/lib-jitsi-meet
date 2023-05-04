import { getLogger } from '@jitsi/logger';

import {
    default as NetworkInfo,
    NETWORK_INFO_EVENT
} from '../connectivity/NetworkInfo';
import { getJitterDelay } from '../util/Retry';

const logger = getLogger(__filename);

/**
 *
 *  - prosody 对应的 ...smacks
 *  // 提供可靠性和会话恢复
 * The class contains the logic for triggering connection resume via XEP-0198 stream management.
 * It does two things, the first one is it tracks the internet online/offline status and it makes sure that
 * the reconnect is attempted only while online. The seconds thing is that it tracks the retry attempts and extends
 * the retry interval using the full jitter pattern.
 *
 * 这个类 包含了通过XEP-0198 流管理的连接恢复 ..
 *  它做两件事情 ... 首先跟踪网络在线/离线状态 。。 并且它确保在离线的时候进行重连  ..
 *  第二件事情是  跟踪 重试尝试  并 使用完全的jitter （抖动） 模式 扩展重试周期 。。。
 */
export default class ResumeTask {
    /**
     * Initializes new {@code RetryTask}.
     * @param {Strophe.Connection} stropheConnection - The Strophe connection instance.
     */
    constructor(stropheConnection) {
        this._stropheConn = stropheConnection;

        /**
         * The counter increased before each resume retry attempt, used to calculate exponential backoff.
         * 每一次恢复尝试都会增加 ... 用于计算指数退避 ...(减轻服务器压力)
         * @type {number}
         * @private
         */
        this._resumeRetryN = 0;

        this._retryDelay = undefined;
    }

    /**
     * @returns {number|undefined} - How much the app will wait before trying to resume the XMPP connection. When
     * 'undefined' it means that no resume task was not scheduled.
     *
     * 当为undefined 标识没有恢复任务是没有调度的 。。。
     * 标识app 应该等待多久触发恢复xmpp 连接 ..
     */
    get retryDelay() {
        return this._retryDelay;
    }

    /**
     * Called by {@link XmppConnection} when the connection drops and it's a signal it wants to schedule a reconnect.
     *
     * 当连接挂掉  由XmppConnection 调用 并且它是一个信号  它想要调度一个重连..
     * @returns {void}
     */
    schedule() {
        this._cancelResume();

        this._resumeRetryN += 1;

        // 网络在线监听器 ..
        this._networkOnlineListener

            // 添加一个监听器
            = NetworkInfo.addEventListener(
                NETWORK_INFO_EVENT,
                ({ isOnline }) => {
                    if (isOnline) {
                        this._scheduleResume();
                    } else {
                        this._cancelResume();
                    }
                });

        NetworkInfo.isOnline() && this._scheduleResume();
    }

    /**
     * Schedules a delayed timeout which will execute the resume action.
     * 调度一个timer 执行恢复动作 ...
     * @private
     * @returns {void}
     */
    _scheduleResume() {
        // 不需要调度 ..
        if (this._resumeTimeout) {

            // NO-OP
            return;
        }

        // The retry delay will be:
        //   1st retry: 1.5s - 3s
        //   2nd retry: 3s - 9s
        //   3rd and next retry: 4.5s - 27s
        // 根据指数退避进行重试计算 ...
        this._resumeRetryN = Math.min(3, this._resumeRetryN);

        // 最小延时 3秒
        this._retryDelay = getJitterDelay(
            /* retry */ this._resumeRetryN,
            /* minDelay */ this._resumeRetryN * 1500,
            3);

        logger.info(`Will try to resume the XMPP connection in ${this.retryDelay}ms`);

        // 设置一个timer
        this._resumeTimeout = setTimeout(() => this._resumeConnection(), this.retryDelay);
    }

    /**
     * Cancels the delayed resume task.
     *
     * @private
     * @returns {void}
     */
    _cancelResume() {
        if (this._resumeTimeout) {
            logger.info('Canceling connection resume task');
            clearTimeout(this._resumeTimeout);
            this._resumeTimeout = undefined;
            this._retryDelay = undefined;
        }
    }

    /**
     * Resumes the XMPP connection using the stream management plugin.
     * 恢复xmpp 连接 - 使用stream 管理插件 ...
     * @private
     * @returns {void}
     */
    _resumeConnection() {

        // 连接到服务器之后 就可以使用流管理对象 ...
        const { streamManagement } = this._stropheConn;

        const resumeToken = streamManagement.getResumeToken();


        // 当任务开始调度,这个resumeToken可能发生改变
        // Things may have changed since when the task was scheduled
        if (!resumeToken) {
            return;
        }

        logger.info('Trying to resume the XMPP connection');

        // 获取服务的url
        const url = new URL(this._stropheConn.service);
        let { search } = url;
        const pattern = /(previd=)([\w-]+)/;

        // 进行匹配 ...
        const oldToken = search.match(pattern);

        // Replace previd if the previd value has changed.
        // 替代previd 如果 发生了改变 ..
        if (oldToken && oldToken.indexOf(resumeToken) === -1) {
            // 替代 ... 使用新的token 进行替换
            search = search.replace(pattern, `$1${resumeToken}`);

        // Append previd if it doesn't exist.
            // 如果不存在
        } else if (!oldToken) {
            // 手动加入一个
            search += search.indexOf('?') === -1 ? `?previd=${resumeToken}` : `&previd=${resumeToken}`;
        }

        url.search = search;

        // 然后重新修改service 地址 ..
        this._stropheConn.service = url.toString();

        // 然后resume 进行流的恢复
        streamManagement.resume();
    }

    /**
     * Cancels the retry task. It's called by {@link XmppConnection} when it's no longer interested in reconnecting for
     * example when the disconnect method is called.
     *
     * @returns {void}
     */
    cancel() {
        this._cancelResume();
        this._resumeRetryN = 0;
        if (this._networkOnlineListener) {
            this._networkOnlineListener();
            this._networkOnlineListener = null;
        }
    }
}
