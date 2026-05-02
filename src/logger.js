/**
 * logger.js
 * Centralised logging system for Scratch Copilot.
 * Provides levelled logging, performance timers, and a persistent
 * in-memory log buffer that the debug panel can consume.
 */

(function () {
  "use strict";

  const MAX_BUFFER = 500;
  const LEVELS = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };

  let currentLevel = LEVELS.info;
  const buffer = [];

  function ts() {
    return new Date().toISOString().slice(11, 23);
  }

  function push(level, tag, args) {
    const entry = {
      time: ts(),
      level,
      tag,
      message: args.map((a) => (typeof a === "object" ? JSON.stringify(a, null, 2) : String(a))).join(" "),
    };
    buffer.push(entry);
    if (buffer.length > MAX_BUFFER) buffer.shift();
    return entry;
  }

  function emit(level, tag, args) {
    if (LEVELS[level] < currentLevel) return;
    const entry = push(level, tag, args);
    const prefix = `[ScratchCopilot][${entry.time}][${tag}]`;
    switch (level) {
      case "debug":
        console.debug(prefix, ...args);
        break;
      case "info":
        console.log(prefix, ...args);
        break;
      case "warn":
        console.warn(prefix, ...args);
        break;
      case "error":
        console.error(prefix, ...args);
        break;
    }
  }

  /** Create a scoped logger for a module. */
  function createLogger(tag) {
    return {
      debug: (...args) => emit("debug", tag, args),
      info: (...args) => emit("info", tag, args),
      warn: (...args) => emit("warn", tag, args),
      error: (...args) => emit("error", tag, args),
      /** Start a performance timer; returns a stop function. */
      time(label) {
        const start = performance.now();
        this.debug(`⏱ START ${label}`);
        return () => {
          const ms = (performance.now() - start).toFixed(1);
          this.debug(`⏱ END ${label} (${ms}ms)`);
          return parseFloat(ms);
        };
      },
      /** Log and return an error (useful inside catch blocks). */
      catch(err, context = "") {
        const msg = err?.message || String(err);
        this.error(context ? `${context}: ${msg}` : msg);
        return err;
      },
    };
  }

  function setLevel(level) {
    if (LEVELS[level] !== undefined) currentLevel = LEVELS[level];
  }

  function getBuffer() {
    return buffer.slice();
  }

  function clearBuffer() {
    buffer.length = 0;
  }

  window.ScratchCopilot = window.ScratchCopilot || {};
  window.ScratchCopilot.logger = {
    createLogger,
    setLevel,
    getBuffer,
    clearBuffer,
    LEVELS,
  };
})();
