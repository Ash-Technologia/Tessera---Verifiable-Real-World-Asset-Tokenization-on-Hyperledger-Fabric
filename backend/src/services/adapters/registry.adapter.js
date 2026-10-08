'use strict';

/**
 * TESSERA External Source Adapter — RegistryAdapter
 *
 * Lightweight interface/adapter for government land and transport registries.
 * In Phase 3: Simulated adapter providing standardized verification attestation.
 * In future phases: Connects to real regional land/vehicle registries via API.
 */
class RegistryAdapter {
  constructor() {
    this.name = 'Government Registry Adapter';
    this.simulated = true;
  }

  /**
   * Verifies an asset's identity against the government registry.
   *
   * @param {string} assetType - 'vehicle' | 'land' | 'grain'
   * @param {object} attributes - Asset attributes
   * @returns {Promise<{ verified: boolean, registryId: string, attester: string, remarks: string }>}
   */
  async verifyRegistration(assetType, attributes) {
    if (assetType === 'vehicle') {
      const vin = attributes.vin;
      const reg = attributes.registrationNumber;
      if (!vin || !reg) {
        return { verified: false, remarks: 'Missing VIN or registration number' };
      }
      return {
        verified: true,
        registryId: `REG-VEH-${vin.slice(-6)}`,
        attester: 'Regional Transport Authority (RTO)',
        remarks: 'Vehicle registration active and records match state database',
      };
    }

    if (assetType === 'land') {
      const surveyNumber = attributes.surveyNumber;
      if (!surveyNumber) {
        return { verified: false, remarks: 'Missing survey number' };
      }
      return {
        verified: true,
        registryId: `REG-LAND-${surveyNumber}`,
        attester: 'Inspector General of Registration & Stamps (IGR)',
        remarks: 'Cadastral title verified and unencumbered in state land portal',
      };
    }

    if (assetType === 'grain') {
      const batch = attributes.batchNumber;
      return {
        verified: true,
        registryId: `REG-GRAIN-${batch || '001'}`,
        attester: 'Warehousing Development and Regulatory Authority (WDRA)',
        remarks: 'Depository electronic warehouse receipt active',
      };
    }

    return { verified: true, attester: 'Simulated Registry Authority', remarks: 'Record attested' };
  }
}

module.exports = new RegistryAdapter();
