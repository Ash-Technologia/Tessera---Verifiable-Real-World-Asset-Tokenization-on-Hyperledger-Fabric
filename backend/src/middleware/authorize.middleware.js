'use strict';

const logger = require('../utils/logger');

/**
 * Enforces that the authenticated user possesses one of the required roles.
 * Platform ADMIN bypasses role restriction by design.
 *
 * @param {...string} allowedRoles
 * @returns {import('express').RequestHandler}
 */
function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication required before checking role permissions',
      });
    }

    if (req.user.role === 'ADMIN' || allowedRoles.includes(req.user.role)) {
      return next();
    }

    logger.warn('Role authorization failed', {
      userId: req.user.userId,
      userRole: req.user.role,
      requiredRoles: allowedRoles,
      path: req.path,
    });

    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: `Role '${req.user.role}' is not authorized for this operation. Required: ${allowedRoles.join(', ')}`,
      code: 'ERR_INSUFFICIENT_ROLE',
    });
  };
}

/**
 * Enforces that the authenticated user belongs to one of the authorized organizations (MSPs).
 * Platform ADMIN bypasses org restriction.
 *
 * @param {...string} allowedOrgs
 * @returns {import('express').RequestHandler}
 */
function requireOrg(...allowedOrgs) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication required before checking organization boundary',
      });
    }

    if (req.user.role === 'ADMIN' || allowedOrgs.includes(req.user.organization)) {
      return next();
    }

    logger.warn('Organization boundary check failed', {
      userId: req.user.userId,
      userOrg: req.user.organization,
      requiredOrgs: allowedOrgs,
      path: req.path,
    });

    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: `Organization '${req.user.organization}' is not permitted for this operation. Required: ${allowedOrgs.join(', ')}`,
      code: 'ERR_CROSS_ORG_FORBIDDEN',
    });
  };
}

/**
 * Enforces that the authenticated user holds specific granular permissions.
 *
 * @param {...string} requiredPermissions
 * @returns {import('express').RequestHandler}
 */
function requirePermission(...requiredPermissions) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication required before checking permissions',
      });
    }

    const userPerms = req.user.permissions || [];
    if (userPerms.includes('*')) {
      return next();
    }

    const missing = requiredPermissions.filter(p => !userPerms.includes(p));
    if (missing.length === 0) {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: `Missing required permission(s): ${missing.join(', ')}`,
      code: 'ERR_PERMISSION_DENIED',
    });
  };
}

module.exports = {
  requireRoles,
  requireOrg,
  requirePermission,
};
