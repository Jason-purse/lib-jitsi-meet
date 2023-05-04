/**
 * This utility class defines custom onerror and onunhandledrejection functions.
 * The custom error handlers respect the previously-defined error handlers.
 * GlobalOnErrorHandler class provides utilities to add many custom error
 * handlers and to execute the error handlers directly.
 *
 * 这是一个工具类 定义了自定义的onError 以及 onunhandlerrejection 函数
 * 自定义错误处理器  尊重/关心之前定义的错误 处理器 .
 * GlobalOnErrorHandler 类提供了功能去增加 许多自定义的错误处理器  并直接执行错误处理器 ...
 */


/**
 * List with global error handlers that will be executed.
 */
const handlers = [];

// If an old handler exists, also fire its events.
const oldOnErrorHandler = window.onerror;

/**
 * Custom error handler that calls the old global error handler and executes
 * all handlers that were previously added.
 */
function JitsiGlobalErrorHandler(...args) {
    handlers.forEach(handler => handler(...args));
    oldOnErrorHandler && oldOnErrorHandler(...args);
}

// If an old handler exists, also fire its events.
const oldOnUnhandledRejection = window.onunhandledrejection;

/**
 * Custom handler that calls the old global handler and executes all handlers
 * that were previously added. This handler handles rejected Promises.
 */
function JitsiGlobalUnhandledRejection(event) {
    handlers.forEach(handler => handler(null, null, null, null, event.reason));
    oldOnUnhandledRejection && oldOnUnhandledRejection(event);
}

// Setting the custom error handlers.
window.onerror = JitsiGlobalErrorHandler;
window.onunhandledrejection = JitsiGlobalUnhandledRejection;

const GlobalOnErrorHandler = {
    /**
     * Adds new error handlers.
     * @param handler the new handler.
     */
    addHandler(handler) {
        handlers.push(handler);
    },

    /**
     * 如果有错误处理器,调用错误处理器 ...
     * Calls the global error handler if there is one.
     * @param error the error to pass to the error handler
     */
    callErrorHandler(error) {
        const errHandler = window.onerror;

        if (!errHandler) {
            return;
        }

        // 否则直接执行 。。。
        errHandler(null, null, null, null, error);
    },

    /**
     * Calls the global rejection handler if there is one.
     * @param error the error to pass to the rejection handler.
     */
    callUnhandledRejectionHandler(error) {
        const errHandler = window.onunhandledrejection;

        if (!errHandler) {
            return;
        }
        errHandler(error);
    }
};


module.exports = GlobalOnErrorHandler;
