declare interface Strophe {
  log: ( level: unknown, msg: unknown ) => void; // TODO:
  getLastErrorStatus: () => number;
  getStatusString: ( status: unknown ) => string; // TODO:
  getTimeSinceLastSuccess: () => number | null;
}

// _default 默认实现就是 function(无名函数)
// 一种约定
export default function _default(): void;