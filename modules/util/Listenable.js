import EventEmitter from 'events';

/**
 * The class implements basic event operations - add/remove listener.
 * NOTE: The purpose of the class is to be extended in order to add
 * this functionality to other classes.
 *
 * 基本事件操作的类实现 (增加/移除事件)
 * 注意 这个类的目的是用于继承  从而增加  事件处理能力 ..
 */
export default class Listenable {
    /**
     * Creates new instance.
     * @param {EventEmitter} eventEmitter
     * @constructor
     */
    constructor(eventEmitter = new EventEmitter()) {
        this.eventEmitter = eventEmitter;

        // aliases for addListener/removeListener
        this.addEventListener = this.on = this.addListener;
        this.removeEventListener = this.off = this.removeListener;
    }

    /**
     * Adds new listener.
     * @param {String} eventName the name of the event
     * @param {Function} listener the listener.
     * @returns {Function} - The unsubscribe function.
     */
    addListener(eventName, listener) {
        this.eventEmitter.addListener(eventName, listener);

        return () => this.removeEventListener(eventName, listener);
    }

    /**
     * Removes listener.
     * @param {String} eventName the name of the event that triggers the
     * listener
     * @param {Function} listener the listener.
     */
    removeListener(eventName, listener) {
        this.eventEmitter.removeListener(eventName, listener);
    }
}
