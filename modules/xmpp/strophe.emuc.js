/* global $ */

import { getLogger } from '@jitsi/logger';
import { Strophe } from 'strophe.js';

import { XMPPEvents } from '../../service/xmpp/XMPPEvents';

import ChatRoom from './ChatRoom';
import { ConnectionPluginListenable } from './ConnectionPlugin';

const logger = getLogger(__filename);

/**
 * MUC connection plugin.
 * muc 连接插件    组件和客户端进行通信
 */
export default class MucConnectionPlugin extends ConnectionPluginListenable {
    /**
     *
     * @param xmpp
     */
    constructor(xmpp) {
        super();
        this.xmpp = xmpp;
        this.rooms = {};
    }

    /**
     * 这个连接是XMPPConnection  对象(具有增加handler的功能)
     * @param connection
     */
    init(connection) {
        super.init(connection);

        // add handlers (just once)
        // As a convenience, the ns parameters applies to the top level element and also any of its immediate children.  This is primarily to make matching /iq/query elements easy.
        // 命名空间应用在顶级元素 以及任何直接的子元素  ..  主要是更容易的匹配iq/query 元素
        // 此方法返回false ,表示接受一次
        // presence 表示一个stanza
        // Parameters:
        //     (Function) handler - The user callback.
        // (String) ns - The namespace to match.
        // (String) name - The stanza name to match.
        // (String|Array) type - The stanza type (or types if an array) to match.
        // (String) id - The stanza id attribute to match.
        // (String) from - The stanza from attribute to match.
        // (String) options - The handler options
        // 这里的东西 和 jitsi -meet 写的 客户端代理 关联

        this.connection.addHandler(this.onPresence.bind(this), null,
            'presence', null, null, null, null);

        // 设置类型 ..
        this.connection.addHandler(this.onPresenceUnavailable.bind(this),
            null, 'presence', 'unavailable', null);

        // 错误
        this.connection.addHandler(this.onPresenceError.bind(this), null,
            'presence', 'error', null);

        // message
        this.connection.addHandler(this.onMessage.bind(this), null,
            'message', null, null);

        // mute 静音
        this.connection.addHandler(this.onMute.bind(this),
            'http://jitsi.org/jitmeet/audio', 'iq', 'set', null, null);

        // 视频静音
        this.connection.addHandler(this.onMuteVideo.bind(this),
            'http://jitsi.org/jitmeet/video', 'iq', 'set', null, null);
    }

    /**
     *
     * @param jid
     * @param password
     * @param options
     */
    createRoom(jid, password, options) {
        const roomJid = Strophe.getBareJidFromJid(jid);

        if (this.isRoomCreated(roomJid)) {
            const errmsg = 'You are already in the room!';

            logger.error(errmsg);
            throw new Error(errmsg);
        }
        this.rooms[roomJid] = new ChatRoom(this.connection, jid,
            password, this.xmpp, options);
        this.eventEmitter.emit(
            XMPPEvents.EMUC_ROOM_ADDED, this.rooms[roomJid]);

        return this.rooms[roomJid];
    }

    /**
     *  Check if a room with the passed JID is already created.
     *
     * @param {string} roomJid - The JID of the room.
     * @returns {boolean}
     */
    isRoomCreated(roomJid) {
        return roomJid in this.rooms;
    }

    /**
     * 移除 muc
     * @param jid
     */
    doLeave(jid) {
        this.eventEmitter.emit(
            XMPPEvents.EMUC_ROOM_REMOVED, this.rooms[jid]);
        delete this.rooms[jid];
    }

    /**
     * 出现(出席、参加、风度、仪态)
     * @param pres
     */
    onPresence(pres) {
        // 获取from
        const from = pres.getAttribute('from');

        // What is this for? A workaround for something?
        // 这是做什么用的？某些事情的解决方法？
        if (pres.getAttribute('type')) {
            return true;
        }

        // 获取 真实的jid(Get the bare JID from a JID String.)
        // 表示这个人应该处于那个房间
        const room = this.rooms[Strophe.getBareJidFromJid(from)];

        // 如果没有房间表示第一次出现
        if (!room) {
            return true;
        }

        // Parse status.
        // xpath 解析方式
        if ($(pres).find('>x[xmlns="http://jabber.org/protocol/muc#user"]'
            + '>status[code="201"]').length) {
            // 创建非匿名房间
            room.createNonAnonymousRoom();
        }

        // 否则交给房间  presence
        room.onPresence(pres);

        return true;
    }

    /**
     *
     * @param pres
     */
    onPresenceUnavailable(pres) {
        const from = pres.getAttribute('from');
        const room = this.rooms[Strophe.getBareJidFromJid(from)];

        if (!room) {
            return true;
        }

        room.onPresenceUnavailable(pres, from);

        return true;
    }

    /**
     *
     * @param pres
     */
    onPresenceError(pres) {
        const from = pres.getAttribute('from');
        const room = this.rooms[Strophe.getBareJidFromJid(from)];

        if (!room) {
            return true;
        }

        room.onPresenceError(pres, from);

        return true;
    }

    /**
     *
     * @param msg
     */
    onMessage(msg) {
        // FIXME: this is a hack. but jingle on muc makes nickchanges hard
        const from = msg.getAttribute('from');
        const room = this.rooms[Strophe.getBareJidFromJid(from)];

        if (!room) {
            return true;
        }

        room.onMessage(msg, from);

        return true;
    }

    /**
     * TODO: Document
     * @param iq
     */
    onMute(iq) {
        const from = iq.getAttribute('from');
        const room = this.rooms[Strophe.getBareJidFromJid(from)];

        // Returning false would result in the listener being deregistered by Strophe
        if (!room) {
            return true;
        }

        room.onMute(iq);

        return true;
    }

    /**
     * TODO: Document
     * @param iq
     */
    onMuteVideo(iq) {
        const from = iq.getAttribute('from');
        const room = this.rooms[Strophe.getBareJidFromJid(from)];

        // Returning false would result in the listener being deregistered by Strophe
        if (!room) {
            return true;
        }

        room.onMuteVideo(iq);

        return true;
    }
}
