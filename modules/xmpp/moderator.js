/* global $ */

import { getLogger } from '@jitsi/logger';
import { $iq, Strophe } from 'strophe.js';

import Settings from '../settings/Settings';

const AuthenticationEvents
    = require('../../service/authentication/AuthenticationEvents');
const { XMPPEvents } = require('../../service/xmpp/XMPPEvents');
const GlobalOnErrorHandler = require('../util/GlobalOnErrorHandler');

const logger = getLogger(__filename);

/**
 *
 * @param step
 */
function createExpBackoffTimer(step) {
    let count = 1;

    return function(reset) {
        // Reset call
        if (reset) {
            count = 1;

            return;
        }

        // Calculate next timeout
        const timeout = Math.pow(2, count - 1);

        count += 1;

        return timeout * step;
    };
}

/* eslint-disable max-params */

/**
 * 调节者(所有者)
 * @param roomName
 * @param {XMPP} xmpp
 * @param emitter
 * @param options
 */
export default function Moderator(roomName, xmpp, emitter, options) {
    this.roomName = roomName;
    this.xmppService = xmpp;
    this.getNextTimeout = createExpBackoffTimer(1000);
    this.getNextErrorTimeout = createExpBackoffTimer(1000);

    // External authentication stuff
    this.externalAuthEnabled = false;
    this.options = options;

    // Whether SIP gateway (jigasi) support is enabled. This is set
    // based on conference properties received in presence.

    // 基于presence 中接受的会议属性设置进行处理 ...
    this.sipGatewayEnabled = false;

    this.eventEmitter = emitter;

    this.connection = this.xmppService.connection;

    // FIXME: Message listener that talks to POPUP window
    /**
     *
     * @param event
     */
    function listener(event) {
        if (event.data && event.data.sessionId) {
            if (event.origin !== window.location.origin) {
                logger.warn(
                    `Ignoring sessionId from different origin: ${
                        event.origin}`);

                return;
            }
            Settings.sessionId = event.data.sessionId;

            // After popup is closed we will authenticate
        }
    }

    // Register
    if (window.addEventListener) {
        window.addEventListener('message', listener, false);
    } else {
        window.attachEvent('onmessage', listener);
    }
}

/* eslint-enable max-params */

Moderator.prototype.isExternalAuthEnabled = function() {
    return this.externalAuthEnabled;
};

Moderator.prototype.isSipGatewayEnabled = function() {
    return this.sipGatewayEnabled;
};

Moderator.prototype.onMucMemberLeft = function(jid) {
    const resource = Strophe.getResourceFromJid(jid);

    if (resource === 'focus') {
        logger.info(
            'Focus has left the room - leaving conference');
        this.eventEmitter.emit(XMPPEvents.FOCUS_LEFT);
    }
};

Moderator.prototype.setFocusUserJid = function(focusJid) {
    if (!this.focusUserJid) {
        this.focusUserJid = focusJid;
        logger.info(`Focus jid set to:  ${this.focusUserJid}`);
    }
};

Moderator.prototype.getFocusUserJid = function() {
    return this.focusUserJid;
};

// 获取 focus 组件
Moderator.prototype.getFocusComponent = function() {
    // Get focus component address
    // 其实就是看 focus 组件配置地址
    let focusComponent = this.options.connection.hosts.focus;

    // If not specified use default:  'focus.domain'

    if (!focusComponent) {
        // 如果没有,根据  hosts.domain 进行配置
        focusComponent = `focus.${this.options.connection.hosts.domain}`;
    }

    return focusComponent;
};

// 创建 conference IQ
Moderator.prototype.createConferenceIq = function() {
    // Generate create conference IQ
    const elem = $iq({ to: this.getFocusComponent(),
        type: 'set' });

    // Session Id used for authentication
    const { sessionId } = Settings;

    // 随机生成的机器码
    const machineUID = Settings.machineId;
    const config = this.options.conference;

    logger.info(`Session ID: ${sessionId} machine UID: ${machineUID}`);

    elem.c('conference', {
        xmlns: 'http://jitsi.org/protocol/focus',
        room: this.roomName,
        'machine-uid': machineUID
    });

    if (sessionId) {
        elem.attrs({ 'session-id': sessionId });
    }

    elem.c(
        'property', {
            name: 'disableRtx',
            value: Boolean(config.disableRtx)
        }).up();

    if (config.audioPacketDelay !== undefined) {
        elem.c(
            'property', {
                name: 'audioPacketDelay',
                value: config.audioPacketDelay
            }).up();
    }
    if (config.startBitrate) {
        elem.c(
            'property', {
                name: 'startBitrate',
                value: config.startBitrate
            }).up();
    }
    if (config.minBitrate) {
        elem.c(
            'property', {
                name: 'minBitrate',
                value: config.minBitrate
            }).up();
    }

    if (this.options.conference.startAudioMuted !== undefined) {
        elem.c(
            'property', {
                name: 'startAudioMuted',
                value: this.options.conference.startAudioMuted
            }).up();
    }
    if (this.options.conference.startVideoMuted !== undefined) {
        elem.c(
            'property', {
                name: 'startVideoMuted',
                value: this.options.conference.startVideoMuted
            }).up();
    }

    // this flag determines whether the bridge will include this call in its
    // rtcstats reporting or not. If the site admin hasn't set the flag in
    // config.js, then the client defaults to false (see
    // react/features/rtcstats/functions.js in jitsi-meet). The server-side
    // components default to true to match the pre-existing behavior so we only
    // signal if false.

    // 这个标志决定 是否桥也包括到这个call 到 它的rtcstats 报道中 ..
    // 如果站点管理者 没有设置这个flag到config.js ,默认关闭 ...
    // 服务端组件会正确的匹配之前的行为,因此我们总是在false 情况下发送信号 ..
    const rtcstatsEnabled = this.options.conference?.analytics?.rtcstatsEnabled ?? false;

    if (!rtcstatsEnabled) {
        elem.c(
            'property', {
                name: 'rtcstatsEnabled',
                value: rtcstatsEnabled
            }).up();
    }

    const { callStatsID, callStatsSecret, disableThirdPartyRequests, enableCallStats } = this.options.conference;
    const callstatsDisabled = !callStatsID || !callStatsSecret || !enableCallStats

        // Even though AppID and AppSecret may be specified, the integration
        // of callstats.io may be disabled because of globally-disallowed
        // requests to any third parties.
        // 即使 appId 以及 AppSecret 被指定,这个callstats.io的集成也许被 禁用(因为 全局禁止第三方 请求)
        || disableThirdPartyRequests === true;

    // since the default is true across all the server-side components, only signal if false.
    // 在所有服务端组件上因此默认为 true,仅仅为false,发送 信号  ...
    if (callstatsDisabled) {
        elem.c(
            'property', {
                name: 'callstatsEnabled',
                value: !callstatsDisabled
            }).up();
    }
    elem.up();

    return elem;
};


Moderator.prototype.parseSessionId = function(resultIq) {
    // eslint-disable-next-line newline-per-chained-call
    const sessionId = $(resultIq).find('conference').attr('session-id');

    // 有可能没有获取到sessionId
    if (sessionId) {
        logger.info(`Received sessionId:  ${sessionId}`);
        Settings.sessionId = sessionId;
    }
};

// 设置配置选项
Moderator.prototype.parseConfigOptions = function(resultIq) {
    // eslint-disable-next-line newline-per-chained-call
    this.setFocusUserJid($(resultIq).find('conference').attr('focusjid'));

    // 是否启用了认证
    const authenticationEnabled
        = $(resultIq).find(
            '>conference>property'
            + '[name=\'authentication\'][value=\'true\']').length > 0;

    logger.info(`Authentication enabled: ${authenticationEnabled}`);

    // 是否有外部认证 ...
    this.externalAuthEnabled = $(resultIq).find(
        '>conference>property'
            + '[name=\'externalAuth\'][value=\'true\']').length > 0;

    logger.info(
        `External authentication enabled: ${this.externalAuthEnabled}`);

    if (!this.externalAuthEnabled) {
        // We expect to receive sessionId in 'internal' authentication mode
        // 我们期待在internal 认证模式中获取一个sessionId
        this.parseSessionId(resultIq);
    }

    // 认证身份
    // eslint-disable-next-line newline-per-chained-call
    const authIdentity = $(resultIq).find('>conference').attr('identity');

    this.eventEmitter.emit(AuthenticationEvents.IDENTITY_UPDATED,
        authenticationEnabled, authIdentity);

    // Check if jicofo has jigasi support enabled.
    if ($(resultIq).find(
        '>conference>property'
        + '[name=\'sipGatewayEnabled\'][value=\'true\']').length) {
        this.sipGatewayEnabled = true;
    }

    logger.info(`Sip gateway enabled:  ${this.sipGatewayEnabled}`);
};

// FIXME We need to show the fact that we're waiting for the focus to the user
// 我们需要展示事实(等待 focus的用户)
// (or that the focus is not available)
// 或者focus 不可用
/**
 * Allocates the conference focus.
 * 分配 会议焦点
 * @param {Function} callback - the function to be called back upon the
 * successful allocation of the conference focus
 * @returns {Promise} - Resolved when Jicofo allows to join the room. It's never
 * rejected and it'll keep on pinging Jicofo forever.
 */
Moderator.prototype.allocateConferenceFocus = function() {
    // 成功分配focus 之后
    return new Promise(resolve => {
        // Try to use focus user JID from the config
        // 设置focus JID
        this.setFocusUserJid(this.options.connection.focusUserJid);

        // Send create conference IQ
        // 发送 conference IQ
        this.connection.sendIQ(
            this.createConferenceIq(),
            result => this._allocateConferenceFocusSuccess(result, resolve),
            error => this._allocateConferenceFocusError(error, resolve));

        // XXX We're pressed for time here because we're beginning a complex
        // and/or lengthy conference-establishment process which supposedly
        // involves multiple RTTs. We don't have the time to wait for Strophe to
        // decide to send our IQ.
        // 在此时将所有的即将流出的数据... 因为我们正在开始一个负载的或者长期的会议建立过程(可能涉及到多个RTT),我们没有时间等待Strophe 去决定发送我们的IQ  ...
        this.connection.flush();
    });
};

/**
 * Invoked by {@link #allocateConferenceFocus} upon its request receiving an
 * error result.
 *
 * @param error - the error result of the request that
 * {@link #allocateConferenceFocus} sent
 * @param {Function} callback - the function to be called back upon the
 * successful allocation of the conference focus
 */
Moderator.prototype._allocateConferenceFocusError = function(error, callback) {
    // If the session is invalid, remove and try again without session ID to get
    // a new one
    const invalidSession
        = $(error).find('>error>session-invalid').length
            || $(error).find('>error>not-acceptable').length;

    if (invalidSession) {
        logger.info('Session expired! - removing');
        Settings.sessionId = undefined;
    }
    if ($(error).find('>error>graceful-shutdown').length) {
        this.eventEmitter.emit(XMPPEvents.GRACEFUL_SHUTDOWN);

        return;
    }

    // Check for error returned by the reservation system
    const reservationErr = $(error).find('>error>reservation-error');

    if (reservationErr.length) {
        // Trigger error event
        const errorCode = reservationErr.attr('error-code');
        const errorTextNode = $(error).find('>error>text');
        let errorMsg;

        if (errorTextNode) {
            errorMsg = errorTextNode.text();
        }
        this.eventEmitter.emit(
            XMPPEvents.RESERVATION_ERROR,
            errorCode,
            errorMsg);

        return;
    }

    // Not authorized to create new room
    if ($(error).find('>error>not-authorized').length) {
        logger.warn('Unauthorized to start the conference', error);
        const toDomain = Strophe.getDomainFromJid(error.getAttribute('to'));

        if (toDomain !== this.options.connection.hosts.anonymousdomain) {
            // FIXME "is external" should come either from the focus or
            // config.js
            this.externalAuthEnabled = true;
        }
        this.eventEmitter.emit(XMPPEvents.AUTHENTICATION_REQUIRED);

        return;
    }
    const waitMs = this.getNextErrorTimeout();
    const errmsg = `Focus error, retry after ${waitMs}`;

    GlobalOnErrorHandler.callErrorHandler(new Error(errmsg));
    logger.error(errmsg, error);

    // Show message
    const focusComponent = this.getFocusComponent();
    const retrySec = waitMs / 1000;

    // FIXME: message is duplicated ? Do not show in case of session invalid
    // which means just a retry

    if (!invalidSession) {
        this.eventEmitter.emit(
            XMPPEvents.FOCUS_DISCONNECTED,
            focusComponent,
            retrySec);
    }

    // Reset response timeout
    this.getNextTimeout(true);
    window.setTimeout(
        () => this.allocateConferenceFocus().then(callback),
        waitMs);
};

/**
 * Invoked by {@link #allocateConferenceFocus} upon its request receiving a
 * success (i.e. non-error) result.
 *
 * 如果分配成功
 *
 * @param result - the success (i.e. non-error) result of the request that
 * {@link #allocateConferenceFocus} sent
 * @param {Function} callback - the function to be called back upon the
 * successful allocation of the conference focus
 */
Moderator.prototype._allocateConferenceFocusSuccess = function(
        result,
        callback) {
    // Setup config options
    // 设置配置选项
    this.parseConfigOptions(result);

    // Reset the error timeout (because we haven't failed here).
    this.getNextErrorTimeout(true);

    // eslint-disable-next-line newline-per-chained-call
    if ($(result).find('conference').attr('ready') === 'true') {
        // Reset the non-error timeout (because we've succeeded here).
        this.getNextTimeout(true);

        // Exec callback
        callback();
    } else {
        const waitMs = this.getNextTimeout();

        logger.info(`Waiting for the focus... ${waitMs}`);
        window.setTimeout(
            () => this.allocateConferenceFocus().then(callback),
            waitMs);
    }
};

Moderator.prototype.authenticate = function() {
    return new Promise((resolve, reject) => {
        this.connection.sendIQ(
            this.createConferenceIq(),
            result => {
                this.parseSessionId(result);
                resolve();
            },
            errorIq => reject({
                error: $(errorIq).find('iq>error :first')
                    .prop('tagName'),
                message: $(errorIq).find('iq>error>text')
                    .text()
            })
        );
    });
};

Moderator.prototype.getLoginUrl = function(urlCallback, failureCallback) {
    this._getLoginUrl(/* popup */ false, urlCallback, failureCallback);
};

/**
 *
 * @param {boolean} popup false for {@link Moderator#getLoginUrl} or true for
 * {@link Moderator#getPopupLoginUrl}
 * @param urlCb
 * @param failureCb
 */
Moderator.prototype._getLoginUrl = function(popup, urlCb, failureCb) {
    const iq = $iq({ to: this.getFocusComponent(),
        type: 'get' });
    const attrs = {
        xmlns: 'http://jitsi.org/protocol/focus',
        room: this.roomName,
        'machine-uid': Settings.machineId
    };
    let str = 'auth url'; // for logger

    if (popup) {
        attrs.popup = true;
        str = `POPUP ${str}`;
    }
    iq.c('login-url', attrs);

    /**
     * Implements a failure callback which reports an error message and an error
     * through (1) GlobalOnErrorHandler, (2) logger, and (3) failureCb.
     *
     * @param {string} errmsg the error messsage to report
     * @param {*} error the error to report (in addition to errmsg)
     */
    function reportError(errmsg, err) {
        GlobalOnErrorHandler.callErrorHandler(new Error(errmsg));
        logger.error(errmsg, err);
        failureCb(err);
    }
    this.connection.sendIQ(
        iq,
        result => {
            // eslint-disable-next-line newline-per-chained-call
            let url = $(result).find('login-url').attr('url');

            url = decodeURIComponent(url);
            if (url) {
                logger.info(`Got ${str}: ${url}`);
                urlCb(url);
            } else {
                reportError(`Failed to get ${str} from the focus`, result);
            }
        },
        reportError.bind(undefined, `Get ${str} error`)
    );
};

Moderator.prototype.getPopupLoginUrl = function(urlCallback, failureCallback) {
    this._getLoginUrl(/* popup */ true, urlCallback, failureCallback);
};

Moderator.prototype.logout = function(callback) {
    const iq = $iq({ to: this.getFocusComponent(),
        type: 'set' });
    const { sessionId } = Settings;

    if (!sessionId) {
        callback();

        return;
    }
    iq.c('logout', {
        xmlns: 'http://jitsi.org/protocol/focus',
        'session-id': sessionId
    });
    this.connection.sendIQ(
        iq,
        result => {
            // eslint-disable-next-line newline-per-chained-call
            let logoutUrl = $(result).find('logout').attr('logout-url');

            if (logoutUrl) {
                logoutUrl = decodeURIComponent(logoutUrl);
            }
            logger.info(`Log out OK, url: ${logoutUrl}`, result);
            Settings.sessionId = undefined;
            callback(logoutUrl);
        },
        error => {
            const errmsg = 'Logout error';

            GlobalOnErrorHandler.callErrorHandler(new Error(errmsg));
            logger.error(errmsg, error);
        }
    );
};
