'use strict';

/**
 * TESSERA Policy Routes — Phase 6A
 *
 * REST API for policy management, version history inspection, and candidate resolution.
 */

const express = require('express');
const router = express.Router();
const policyService = require('../services/policy/policy.service');
const logger = require('../utils/logger');

// GET /api/policies/reason-codes
router.get('/reason-codes', (_req, res) => {
  res.json({
    success: true,
    reasonCodes: policyService.getReasonCodes(),
  });
});

// GET /api/policies/scopes
router.get('/scopes', (_req, res) => {
  res.json({
    success: true,
    scopes: policyService.getScopes(),
  });
});

// POST /api/policies/resolve
router.post('/resolve', (req, res, next) => {
  try {
    const { tokenId, assetId, assetType, atDate } = req.body;
    const candidates = policyService.resolveCandidatePolicies({
      tokenId,
      assetId,
      assetType,
      atDate,
    });
    res.json({
      success: true,
      candidates,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/policies
router.get('/', (req, res, next) => {
  try {
    const { scope, enabled, status, applicableAssetType } = req.query;
    const filter = {};
    if (scope) filter.scope = scope;
    if (typeof enabled === 'string') filter.enabled = enabled === 'true';
    if (status) filter.status = status;
    if (applicableAssetType) filter.applicableAssetType = applicableAssetType;

    const policies = policyService.listPolicies(filter);
    res.json({
      success: true,
      count: policies.length,
      policies,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/policies
router.post('/', (req, res, next) => {
  try {
    const policy = policyService.createPolicy(req.body);
    res.status(201).json({
      success: true,
      policy,
    });
  } catch (err) {
    logger.warn('Policy creation rejected', { error: err.message });
    res.status(400).json({
      success: false,
      error: err.message,
      details: err.details || [],
    });
  }
});

// GET /api/policies/:policyId
router.get('/:policyId', (req, res, next) => {
  try {
    const policy = policyService.getPolicy(req.params.policyId);
    if (!policy) {
      return res.status(404).json({
        success: false,
        error: `Policy not found: ${req.params.policyId}`,
      });
    }
    res.json({
      success: true,
      policy,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/policies/:policyId/versions
router.get('/:policyId/versions', (req, res, next) => {
  try {
    const history = policyService.getPolicyHistory(req.params.policyId);
    res.json({
      success: true,
      policyId: req.params.policyId,
      versionCount: history.length,
      versions: history,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/policies/:policyId/versions/:version
router.get('/:policyId/versions/:version', (req, res, next) => {
  try {
    const policy = policyService.getPolicy(req.params.policyId, req.params.version);
    if (!policy) {
      return res.status(404).json({
        success: false,
        error: `Policy version not found: ${req.params.policyId}@${req.params.version}`,
      });
    }
    res.json({
      success: true,
      policy,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/policies/:policyId/versions/:version/retire
router.patch('/:policyId/versions/:version/retire', (req, res, next) => {
  try {
    const retired = policyService.retirePolicy(req.params.policyId, req.params.version);
    res.json({
      success: true,
      policy: retired,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
