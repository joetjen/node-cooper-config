'use strict';

/**
 * @fileoverview The one error type `cooper-config` throws for a
 * configuration problem: a document that does not load, a value the
 * conversion refuses, a secrets policy it refuses, a value `require()`
 * finds missing, and a read before anything was loaded.
 *
 * A wrong *argument* (an unknown option, a path that is not a string) is
 * a `TypeError` instead: that is a bug in the calling code, not in the
 * configuration, and the two are caught for different reasons.
 */

class CooperConfigError extends Error {
  /**
   * @param {string} message
   * @param {{file?: string, formatted?: string, cause?: unknown}} [details]
   */
  constructor(message, details = {}) {
    super(message, details.cause !== undefined ? { cause: details.cause } : undefined);
    this.name = 'CooperConfigError';
    /**
     * The CASC file being loaded, when the error came from a load.
     * @type {string | undefined}
     */
    this.file = details.file;
    /**
     * What went wrong, without the "failed to load ..." preamble: cooper's
     * error formatted with its location and stage, or the conversion's own
     * refusal. `message` always contains it.
     * @type {string}
     */
    this.formatted = details.formatted ?? message;
  }
}

module.exports = CooperConfigError;
