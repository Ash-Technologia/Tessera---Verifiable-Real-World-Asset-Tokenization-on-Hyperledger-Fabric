'use strict';

/**
 * TESSERA Policy Package — Phase 6A Foundation
 */

const constants = require('./policy.constants');
const model = require('./policy.model');
const registry = require('./policy.registry');
const service = require('./policy.service');

module.exports = {
  ...constants,
  ...model,
  policyRegistry: registry,
  policyService: service,
};
