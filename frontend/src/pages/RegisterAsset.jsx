import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, StatusBadge, LoadingState, ErrorState } from '../components/ui/index.js';
import { templatesApi, assetsApi } from '../services/api/index.js';
import { useIdentity } from '../context/IdentityContext.jsx';
import { Icon } from '../components/ui/Icons.jsx';

const ASSET_TYPES = [
  {
    id: 'vehicle',
    title: 'Vehicle',
    subtitle: 'Cars, Trucks, Commercial Fleet',
    image: '/images/vehicle.jpg',
    canonicalName: 'VIN / Chassis Number',
    defaultFields: 'VIN, Make, Model, Year, Registration Number',
    requiredEvidence: 'RC Certificate, Commercial Insurance Policy, Physical Inspection Report',
    statuses: 'Draft → Verified → Active → Pledged → Frozen → Retired',
    valuation: 'Approved Valuer Report, Market Benchmark, Depreciation',
  },
  {
    id: 'land',
    title: 'Land',
    subtitle: 'Commercial, Plots, Agricultural',
    image: '/images/land.jpg',
    canonicalName: 'Survey / Khasra Number',
    defaultFields: 'Survey Number, Location, Area (sq. ft), Title Deed Reference',
    requiredEvidence: '7/12 Extract, Government Revenue Survey, Encumbrance Certificate',
    statuses: 'Draft → Verified → Active → Pledged → Frozen → Retired',
    valuation: 'Government Guideline Value, Independent Appraiser',
  },
  {
    id: 'grain',
    title: 'Grain',
    subtitle: 'Agricultural Commodities, Warehoused',
    image: '/images/grain.jpg',
    canonicalName: 'Warehouse Receipt ID',
    defaultFields: 'Commodity Type, Grade, Quantity (MT), Moisture %, Storage Warehouse',
    requiredEvidence: 'Electronic Warehouse Receipt, Quality Assay Certificate, Fumigation Record',
    statuses: 'Draft → Verified → Active → Pledged → Frozen → Retired',
    valuation: 'APMC Spot Benchmark, Mandi Index Value',
  },
  {
    id: 'equipment',
    title: 'Equipment & Machinery',
    subtitle: 'Industrial Plant, Heavy Equipment',
    image: '/images/equipment.jpg',
    canonicalName: 'Manufacturer Serial Number',
    defaultFields: 'Equipment Name, Serial Number, Manufacturer, OEM Year',
    requiredEvidence: 'Commercial Purchase Invoice, OEM Warranty, Maintenance Log',
    statuses: 'Draft → Verified → Active → Pledged → Frozen → Retired',
    valuation: 'Straight-line Residual Value, Certified Appraisal',
  },
];

const STEPS = [
  { num: 1, label: 'Asset Type' },
  { num: 2, label: 'Asset Details' },
  { num: 3, label: 'Evidence' },
  { num: 4, label: 'Valuation' },
  { num: 5, label: 'Review & Confirm' },
];

export function RegisterAsset() {
  const navigate = useNavigate();
  const { identity } = useIdentity();
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedType, setSelectedType] = useState('vehicle');
  const [templateData, setTemplateData] = useState(null);
  const [templateLoading, setTemplateLoading] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    assetId: '',
    canonicalIdentity: '',
    make: '',
    model: '',
    year: '2025',
    surveyNumber: '',
    location: '',
    grainType: 'Wheat',
    quantity: '',
    equipmentName: '',
    serialNumber: '',
    description: '',
    // Evidence
    files: [],
    evidenceNote: '',
    // Valuation
    valuationAmount: '',
    valuationCurrency: 'INR',
    valuationMethod: 'APPROVED_VALUER',
    valuerName: '',
    valuationDate: new Date().toISOString().split('T')[0],
  });

  // Step-level inline validation errors
  const [stepErrors, setStepErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(null);

  // Load template schema
  useEffect(() => {
    let active = true;
    async function loadTemplate() {
      setTemplateLoading(true);
      try {
        const tmpl = await templatesApi.getTemplate(selectedType);
        if (active && tmpl) setTemplateData(tmpl);
      } catch {
        if (active) setTemplateData(null);
      } finally {
        if (active) setTemplateLoading(false);
      }
    }
    loadTemplate();
    return () => {
      active = false;
    };
  }, [selectedType]);

  const activeTypeInfo = ASSET_TYPES.find((t) => t.id === selectedType) || ASSET_TYPES[0];

  // ============================================================
  // Step Validation Functions
  // ============================================================
  const validateStep2 = () => {
    const errors = {};
    const assetIdTrimmed = (formData.assetId || '').trim();
    if (!assetIdTrimmed) {
      errors.assetId = 'Asset ID is required and cannot be empty.';
    } else if (!/^[A-Za-z0-9_-]{3,32}$/.test(assetIdTrimmed)) {
      errors.assetId = 'Asset ID must be 3–32 alphanumeric characters, dashes, or underscores.';
    }

    const canonTrimmed = (formData.canonicalIdentity || '').trim();
    if (!canonTrimmed) {
      errors.canonicalIdentity = `${activeTypeInfo.canonicalName} is required.`;
    }

    if (selectedType === 'vehicle') {
      if (!formData.make.trim()) errors.make = 'Vehicle manufacturer (make) is required.';
      if (!formData.model.trim()) errors.model = 'Vehicle model is required.';
      const yr = Number(formData.year);
      if (!yr || yr < 1900 || yr > 2030) errors.year = 'Manufacture year must be between 1900 and 2030.';
    } else if (selectedType === 'land') {
      if (!formData.surveyNumber.trim()) errors.surveyNumber = 'Survey/Khasra number is required.';
    } else if (selectedType === 'grain') {
      if (!formData.grainType.trim()) errors.grainType = 'Commodity type is required.';
      if (!formData.quantity || Number(formData.quantity) <= 0) errors.quantity = 'Quantity must be a positive number (> 0 MT).';
    } else if (selectedType === 'equipment') {
      if (!formData.equipmentName.trim()) errors.equipmentName = 'Equipment name is required.';
      if (!formData.serialNumber.trim()) errors.serialNumber = 'Manufacturer serial number is required.';
    }

    return errors;
  };

  const validateStep3 = () => {
    const errors = {};
    if (formData.files.length === 0 && !formData.evidenceNote.trim()) {
      errors.evidence = 'At least one evidence document or certified attestation note must be attached.';
    }
    return errors;
  };

  const validateStep4 = () => {
    const errors = {};
    const valAmt = Number(formData.valuationAmount);
    if (!formData.valuationAmount || isNaN(valAmt) || valAmt <= 0) {
      errors.valuationAmount = 'A strictly positive valuation appraisal amount (> 0) is required.';
    }
    if (!formData.valuerName.trim()) {
      errors.valuerName = 'Certified valuer or appraising agency name is required.';
    }
    if (!formData.valuationDate) {
      errors.valuationDate = 'Valuation appraisal date is required.';
    }
    return errors;
  };

  // Check overall registration prerequisites for Step 5
  const getPrerequisites = () => {
    const missing = [];
    const step2 = validateStep2();
    if (Object.keys(step2).length > 0) {
      missing.push(...Object.values(step2));
    }
    const step3 = validateStep3();
    if (Object.keys(step3).length > 0) {
      missing.push(...Object.values(step3));
    }
    const step4 = validateStep4();
    if (Object.keys(step4).length > 0) {
      missing.push(...Object.values(step4));
    }
    return missing;
  };

  const missingPrerequisites = getPrerequisites();
  const canSubmit = missingPrerequisites.length === 0;

  const handleNext = () => {
    setStepErrors({});
    if (currentStep === 1) {
      if (!selectedType) {
        setStepErrors({ type: 'Please select an asset type.' });
        return;
      }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      const errors = validateStep2();
      if (Object.keys(errors).length > 0) {
        setStepErrors(errors);
        return;
      }
      setCurrentStep(3);
    } else if (currentStep === 3) {
      const errors = validateStep3();
      if (Object.keys(errors).length > 0) {
        setStepErrors(errors);
        return;
      }
      setCurrentStep(4);
    } else if (currentStep === 4) {
      const errors = validateStep4();
      if (Object.keys(errors).length > 0) {
        setStepErrors(errors);
        return;
      }
      setCurrentStep(5);
    }
  };

  const handleBack = () => {
    setStepErrors({});
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const handleFileUpload = (e) => {
    const uploaded = Array.from(e.target.files || []).map((file) => ({
      name: file.name,
      size: `${(file.size / 1024).toFixed(1)} KB`,
      type: file.type || 'application/pdf',
      category: 'PRIMARY_DOCUMENT',
    }));
    setFormData((prev) => ({ ...prev, files: [...prev.files, ...uploaded] }));
    setStepErrors((prev) => ({ ...prev, evidence: undefined }));
  };

  const handleRemoveFile = (index) => {
    setFormData((prev) => ({
      ...prev,
      files: prev.files.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async () => {
    const finalMissing = getPrerequisites();
    if (finalMissing.length > 0) {
      setSubmitError(`Registration blocked: ${finalMissing.join(', ')}`);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    const assetPayload = {
      assetId: formData.assetId.trim(),
      assetType: selectedType,
      templateId: selectedType,
      templateVersion: '1.0',
      owner: identity?.msp || 'IssuerOrg',
      canonicalIdentity: formData.canonicalIdentity.trim(),
      attributes: {
        ...(selectedType === 'vehicle' && {
          vin: formData.canonicalIdentity.trim(),
          make: formData.make.trim(),
          model: formData.model.trim(),
          year: Number(formData.year),
        }),
        ...(selectedType === 'land' && {
          surveyNumber: formData.surveyNumber.trim() || formData.canonicalIdentity.trim(),
          location: formData.location.trim(),
        }),
        ...(selectedType === 'grain' && {
          warehouseReceiptId: formData.canonicalIdentity.trim(),
          grainType: formData.grainType.trim(),
          quantity: Number(formData.quantity),
        }),
        ...(selectedType === 'equipment' && {
          serialNumber: formData.canonicalIdentity.trim() || formData.serialNumber.trim(),
          equipmentName: formData.equipmentName.trim(),
        }),
        description: formData.description.trim(),
      },
      initialValuation: {
        value: Number(formData.valuationAmount),
        currency: formData.valuationCurrency,
        method: formData.valuationMethod,
        valuer: formData.valuerName.trim(),
        date: formData.valuationDate,
      },
    };

    try {
      const res = await assetsApi.createAsset(assetPayload);
      setSubmitSuccess(res?.asset?.assetId || assetPayload.assetId);
    } catch (err) {
      setSubmitError(err?.message || 'Asset registration transaction failed on Hyperledger Fabric');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitSuccess) {
    return (
      <div className="ts-page-container">
        <div className="ts-success-card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
          <div
            className="ts-success-icon-badge"
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'rgba(34, 197, 94, 0.15)',
              color: 'var(--ts-success, #22c55e)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2rem',
              marginBottom: '1rem',
            }}
          >
            &check;
          </div>
          <h2>Asset Successfully Registered On-Chain</h2>
          <p className="ts-body" style={{ margin: '0.75rem 0 1.5rem', color: 'var(--ts-text-muted)' }}>
            Asset <strong>{submitSuccess}</strong> has been committed to the Hyperledger Fabric ledger
            with validated template parameters and initial valuation.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <Button
              variant="primary"
              id="btn-view-registered-asset"
              onClick={() => navigate(`/assets/${encodeURIComponent(submitSuccess)}`)}
            >
              View Asset Details &rarr;
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setSubmitSuccess(null);
                setCurrentStep(1);
                setFormData({
                  assetId: '',
                  canonicalIdentity: '',
                  make: '',
                  model: '',
                  year: '2025',
                  surveyNumber: '',
                  location: '',
                  grainType: 'Wheat',
                  quantity: '',
                  equipmentName: '',
                  serialNumber: '',
                  description: '',
                  files: [],
                  evidenceNote: '',
                  valuationAmount: '',
                  valuationCurrency: 'INR',
                  valuationMethod: 'APPROVED_VALUER',
                  valuerName: '',
                  valuationDate: new Date().toISOString().split('T')[0],
                });
              }}
            >
              Register Another Asset
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ts-page-container">
      {/* Header */}
      <div className="ts-page-header-row">
        <div>
          <h1 className="ts-screen-title">Register Real-World Asset</h1>
          <p className="ts-screen-subtitle">
            Configure asset identity, attach certified template evidence, and record appraisal metadata.
          </p>
        </div>
      </div>

      {/* 5-Step Stepper */}
      <div className="ts-stepper-wrap">
        <div className="ts-stepper" role="navigation" aria-label="Registration Steps">
          {STEPS.map((s, idx) => {
            const isCompleted = currentStep > s.num;
            const isActive = currentStep === s.num;
            return (
              <React.Fragment key={s.num}>
                <div className="ts-step-item">
                  <div
                    className={`ts-step-num ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
                    aria-current={isActive ? 'step' : undefined}
                  >
                    {isCompleted ? '✓' : s.num}
                  </div>
                  <span className={`ts-step-label ${isActive ? 'active' : ''}`}>{s.label}</span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div className={`ts-step-line ${currentStep > s.num ? 'completed' : ''}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* STEP 1: ASSET TYPE */}
      {currentStep === 1 && (
        <div className="ts-step-content">
          <h2 className="ts-section-heading">1. Select Asset Type & Schema</h2>
          <div className="ts-asset-type-grid" role="radiogroup" aria-label="Asset Type Selection">
            {ASSET_TYPES.map((type) => {
              const isSelected = selectedType === type.id;
              return (
                <div
                  key={type.id}
                  className={`ts-asset-type-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedType(type.id)}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setSelectedType(type.id);
                  }}
                  id={`asset-type-${type.id}`}
                >
                  <div className="ts-type-img-box">
                    <img src={type.image} alt={type.title} className="ts-type-img" />
                  </div>
                  <div className="ts-type-info">
                    <h3 className="ts-type-title">{type.title}</h3>
                    <p className="ts-type-sub">{type.subtitle}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Template Information Card */}
          <div className="ts-template-info-card" style={{ marginTop: '1.5rem' }}>
            <h3 className="ts-template-info-title">Authoritative Template Schema ({activeTypeInfo.title})</h3>
            <div className="ts-template-meta-grid">
              <div className="ts-template-row">
                <span className="ts-tmpl-k">Mandatory Fields</span>
                <span className="ts-tmpl-v">
                  {templateData?.attributes?.map?.((a) => a.name).join(', ') || activeTypeInfo.defaultFields}
                </span>
              </div>
              <div className="ts-template-row">
                <span className="ts-tmpl-k">Required Evidence</span>
                <span className="ts-tmpl-v">{activeTypeInfo.requiredEvidence}</span>
              </div>
              <div className="ts-template-row">
                <span className="ts-tmpl-k">Lifecycle Progression</span>
                <span className="ts-tmpl-v">{activeTypeInfo.statuses}</span>
              </div>
              <div className="ts-template-row">
                <span className="ts-tmpl-k">Accepted Valuation</span>
                <span className="ts-tmpl-v">{activeTypeInfo.valuation}</span>
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div className="ts-step-action-row">
            <div />
            <Button
              id="btn-register-next-step"
              variant="primary"
              onClick={handleNext}
              ariaLabel="Next Step: Asset Details"
            >
              Next: Asset Details &rarr;
            </Button>
          </div>
        </div>
      )}

      {/* STEP 2: ASSET DETAILS */}
      {currentStep === 2 && (
        <div className="ts-step-content">
          <h2 className="ts-section-heading">2. Asset Identity & Parameters ({activeTypeInfo.title})</h2>
          <Card>
            <div className="ts-form-grid">
              <div className="ts-form-group">
                <label className="ts-label" htmlFor="reg-asset-id">
                  Asset ID <span className="ts-required">*</span>
                </label>
                <input
                  id="reg-asset-id"
                  className={`ts-input ${stepErrors.assetId ? 'ts-input-error' : ''}`}
                  placeholder={`e.g. ${selectedType.toUpperCase()}-2026-001`}
                  value={formData.assetId}
                  onChange={(e) => {
                    setFormData({ ...formData, assetId: e.target.value });
                    setStepErrors((prev) => ({ ...prev, assetId: undefined }));
                  }}
                  aria-invalid={Boolean(stepErrors.assetId)}
                  aria-describedby={stepErrors.assetId ? 'reg-asset-id-err' : undefined}
                />
                {stepErrors.assetId && (
                  <span id="reg-asset-id-err" className="ts-field-error" style={{ color: 'var(--ts-danger, #ef4444)', fontSize: '0.78rem' }}>
                    {stepErrors.assetId}
                  </span>
                )}
              </div>

              <div className="ts-form-group">
                <label className="ts-label" htmlFor="reg-canon-id">
                  {activeTypeInfo.canonicalName} <span className="ts-required">*</span>
                </label>
                <input
                  id="reg-canon-id"
                  className={`ts-input ${stepErrors.canonicalIdentity ? 'ts-input-error' : ''}`}
                  placeholder={`Primary identity reference for ${activeTypeInfo.title}...`}
                  value={formData.canonicalIdentity}
                  onChange={(e) => {
                    setFormData({ ...formData, canonicalIdentity: e.target.value });
                    setStepErrors((prev) => ({ ...prev, canonicalIdentity: undefined }));
                  }}
                  aria-invalid={Boolean(stepErrors.canonicalIdentity)}
                  aria-describedby={stepErrors.canonicalIdentity ? 'reg-canon-id-err' : undefined}
                />
                {stepErrors.canonicalIdentity && (
                  <span id="reg-canon-id-err" className="ts-field-error" style={{ color: 'var(--ts-danger, #ef4444)', fontSize: '0.78rem' }}>
                    {stepErrors.canonicalIdentity}
                  </span>
                )}
              </div>

              {selectedType === 'vehicle' && (
                <>
                  <div className="ts-form-group">
                    <label className="ts-label" htmlFor="reg-make">
                      Make / Manufacturer <span className="ts-required">*</span>
                    </label>
                    <input
                      id="reg-make"
                      className={`ts-input ${stepErrors.make ? 'ts-input-error' : ''}`}
                      placeholder="e.g. Tata Motors, Volvo, CAT"
                      value={formData.make}
                      onChange={(e) => {
                        setFormData({ ...formData, make: e.target.value });
                        setStepErrors((prev) => ({ ...prev, make: undefined }));
                      }}
                    />
                    {stepErrors.make && (
                      <span className="ts-field-error" style={{ color: 'var(--ts-danger, #ef4444)', fontSize: '0.78rem' }}>
                        {stepErrors.make}
                      </span>
                    )}
                  </div>
                  <div className="ts-form-group">
                    <label className="ts-label" htmlFor="reg-model">
                      Model <span className="ts-required">*</span>
                    </label>
                    <input
                      id="reg-model"
                      className={`ts-input ${stepErrors.model ? 'ts-input-error' : ''}`}
                      placeholder="e.g. Nexon EV, FH16, 320D"
                      value={formData.model}
                      onChange={(e) => {
                        setFormData({ ...formData, model: e.target.value });
                        setStepErrors((prev) => ({ ...prev, model: undefined }));
                      }}
                    />
                    {stepErrors.model && (
                      <span className="ts-field-error" style={{ color: 'var(--ts-danger, #ef4444)', fontSize: '0.78rem' }}>
                        {stepErrors.model}
                      </span>
                    )}
                  </div>
                  <div className="ts-form-group">
                    <label className="ts-label" htmlFor="reg-year">
                      Manufacture Year <span className="ts-required">*</span>
                    </label>
                    <input
                      id="reg-year"
                      type="number"
                      className={`ts-input ${stepErrors.year ? 'ts-input-error' : ''}`}
                      value={formData.year}
                      onChange={(e) => {
                        setFormData({ ...formData, year: e.target.value });
                        setStepErrors((prev) => ({ ...prev, year: undefined }));
                      }}
                    />
                    {stepErrors.year && (
                      <span className="ts-field-error" style={{ color: 'var(--ts-danger, #ef4444)', fontSize: '0.78rem' }}>
                        {stepErrors.year}
                      </span>
                    )}
                  </div>
                </>
              )}

              {selectedType === 'land' && (
                <>
                  <div className="ts-form-group">
                    <label className="ts-label" htmlFor="reg-survey">
                      Survey / Khasra Number <span className="ts-required">*</span>
                    </label>
                    <input
                      id="reg-survey"
                      className={`ts-input ${stepErrors.surveyNumber ? 'ts-input-error' : ''}`}
                      placeholder="e.g. SY-42/1A, Plot 8B"
                      value={formData.surveyNumber}
                      onChange={(e) => {
                        setFormData({ ...formData, surveyNumber: e.target.value });
                        setStepErrors((prev) => ({ ...prev, surveyNumber: undefined }));
                      }}
                    />
                    {stepErrors.surveyNumber && (
                      <span className="ts-field-error" style={{ color: 'var(--ts-danger, #ef4444)', fontSize: '0.78rem' }}>
                        {stepErrors.surveyNumber}
                      </span>
                    )}
                  </div>
                  <div className="ts-form-group">
                    <label className="ts-label" htmlFor="reg-loc">Location / District</label>
                    <input
                      id="reg-loc"
                      className="ts-input"
                      placeholder="e.g. Bangalore Urban, Karnataka"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    />
                  </div>
                </>
              )}

              {selectedType === 'grain' && (
                <>
                  <div className="ts-form-group">
                    <label className="ts-label" htmlFor="reg-grain">
                      Grain / Commodity <span className="ts-required">*</span>
                    </label>
                    <input
                      id="reg-grain"
                      className={`ts-input ${stepErrors.grainType ? 'ts-input-error' : ''}`}
                      placeholder="e.g. Sharbati Wheat, Grade A Basmati"
                      value={formData.grainType}
                      onChange={(e) => {
                        setFormData({ ...formData, grainType: e.target.value });
                        setStepErrors((prev) => ({ ...prev, grainType: undefined }));
                      }}
                    />
                    {stepErrors.grainType && (
                      <span className="ts-field-error" style={{ color: 'var(--ts-danger, #ef4444)', fontSize: '0.78rem' }}>
                        {stepErrors.grainType}
                      </span>
                    )}
                  </div>
                  <div className="ts-form-group">
                    <label className="ts-label" htmlFor="reg-qty">
                      Quantity (Metric Tonnes) <span className="ts-required">*</span>
                    </label>
                    <input
                      id="reg-qty"
                      type="number"
                      className={`ts-input ${stepErrors.quantity ? 'ts-input-error' : ''}`}
                      placeholder="e.g. 50"
                      value={formData.quantity}
                      onChange={(e) => {
                        setFormData({ ...formData, quantity: e.target.value });
                        setStepErrors((prev) => ({ ...prev, quantity: undefined }));
                      }}
                    />
                    {stepErrors.quantity && (
                      <span className="ts-field-error" style={{ color: 'var(--ts-danger, #ef4444)', fontSize: '0.78rem' }}>
                        {stepErrors.quantity}
                      </span>
                    )}
                  </div>
                </>
              )}

              {selectedType === 'equipment' && (
                <>
                  <div className="ts-form-group">
                    <label className="ts-label" htmlFor="reg-eq-name">
                      Equipment Name <span className="ts-required">*</span>
                    </label>
                    <input
                      id="reg-eq-name"
                      className={`ts-input ${stepErrors.equipmentName ? 'ts-input-error' : ''}`}
                      placeholder="e.g. CAT 320D Excavator"
                      value={formData.equipmentName}
                      onChange={(e) => {
                        setFormData({ ...formData, equipmentName: e.target.value });
                        setStepErrors((prev) => ({ ...prev, equipmentName: undefined }));
                      }}
                    />
                    {stepErrors.equipmentName && (
                      <span className="ts-field-error" style={{ color: 'var(--ts-danger, #ef4444)', fontSize: '0.78rem' }}>
                        {stepErrors.equipmentName}
                      </span>
                    )}
                  </div>
                  <div className="ts-form-group">
                    <label className="ts-label" htmlFor="reg-eq-serial">
                      Serial Number <span className="ts-required">*</span>
                    </label>
                    <input
                      id="reg-eq-serial"
                      className={`ts-input ${stepErrors.serialNumber ? 'ts-input-error' : ''}`}
                      placeholder="e.g. SN-883921"
                      value={formData.serialNumber}
                      onChange={(e) => {
                        setFormData({ ...formData, serialNumber: e.target.value });
                        setStepErrors((prev) => ({ ...prev, serialNumber: undefined }));
                      }}
                    />
                    {stepErrors.serialNumber && (
                      <span className="ts-field-error" style={{ color: 'var(--ts-danger, #ef4444)', fontSize: '0.78rem' }}>
                        {stepErrors.serialNumber}
                      </span>
                    )}
                  </div>
                </>
              )}

              <div className="ts-form-group full-width">
                <label className="ts-label" htmlFor="reg-desc">Asset Description / Notes</label>
                <textarea
                  id="reg-desc"
                  className="ts-input"
                  rows={3}
                  placeholder="Additional metadata, condition summary, or remarks..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
            </div>
          </Card>

          <div className="ts-step-action-row">
            <Button variant="secondary" onClick={handleBack}>
              &larr; Back
            </Button>
            <Button variant="primary" id="btn-details-next" onClick={handleNext}>
              Next: Evidence &rarr;
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3: EVIDENCE */}
      {currentStep === 3 && (
        <div className="ts-step-content">
          <h2 className="ts-section-heading">3. Evidence Documents & Attestations</h2>
          <Card>
            <p className="ts-metadata" style={{ marginBottom: '1rem', color: 'var(--ts-text-muted)' }}>
              Required for {activeTypeInfo.title}: <strong>{activeTypeInfo.requiredEvidence}</strong>
            </p>

            <div className="ts-upload-zone" style={{ marginBottom: '1rem' }}>
              <input
                type="file"
                id="evidence-file-input"
                multiple
                className="ts-file-hidden"
                onChange={handleFileUpload}
              />
              <label htmlFor="evidence-file-input" className="ts-upload-label">
                <div className="ts-upload-icon">&#8679;</div>
                <div className="ts-upload-text">Upload certified evidence document</div>
                <div className="ts-upload-hint">Supported: PDF, PNG, JPEG up to 10MB (SHA-256 commitment computed on upload)</div>
              </label>
            </div>

            {formData.files.length > 0 && (
              <div className="ts-upload-list" style={{ marginBottom: '1rem' }}>
                <h4 style={{ margin: '1rem 0 0.5rem', fontSize: '0.9rem' }}>Attached Documents ({formData.files.length})</h4>
                {formData.files.map((f, i) => (
                  <div
                    key={i}
                    className="ts-upload-item"
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <div>
                      <span className="ts-upload-fname" style={{ fontWeight: 600 }}>{f.name}</span>
                      <span className="ts-metadata" style={{ marginLeft: '0.5rem' }}>({f.size})</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <StatusBadge status="ACTIVE" />
                      <button
                        type="button"
                        onClick={() => handleRemoveFile(i)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                        aria-label={`Remove ${f.name}`}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="ts-form-group full-width">
              <label className="ts-label" htmlFor="reg-evidence-note">
                Certified Storage Reference / Attestation Notes
              </label>
              <textarea
                id="reg-evidence-note"
                className="ts-input"
                rows={2}
                placeholder="e.g. IPFS CID, cloud vault reference, or physical custody notarization..."
                value={formData.evidenceNote}
                onChange={(e) => {
                  setFormData({ ...formData, evidenceNote: e.target.value });
                  setStepErrors((prev) => ({ ...prev, evidence: undefined }));
                }}
              />
            </div>

            {stepErrors.evidence && (
              <div
                style={{
                  marginTop: '0.75rem',
                  padding: '0.5rem 0.75rem',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid #ef4444',
                  borderRadius: '6px',
                  color: '#fca5a5',
                  fontSize: '0.82rem',
                }}
                role="alert"
              >
                {stepErrors.evidence}
              </div>
            )}
          </Card>

          <div className="ts-step-action-row">
            <Button variant="secondary" onClick={handleBack}>
              &larr; Back
            </Button>
            <Button variant="primary" id="btn-evidence-next" onClick={handleNext}>
              Next: Valuation &rarr;
            </Button>
          </div>
        </div>
      )}

      {/* STEP 4: VALUATION */}
      {currentStep === 4 && (
        <div className="ts-step-content">
          <h2 className="ts-section-heading">4. Certified Valuation Metadata</h2>
          <Card>
            <div className="ts-form-grid">
              <div className="ts-form-group">
                <label className="ts-label" htmlFor="val-amt">
                  Valuation Amount <span className="ts-required">*</span>
                </label>
                <input
                  id="val-amt"
                  type="number"
                  className={`ts-input ${stepErrors.valuationAmount ? 'ts-input-error' : ''}`}
                  placeholder="e.g. 1500000"
                  value={formData.valuationAmount}
                  onChange={(e) => {
                    setFormData({ ...formData, valuationAmount: e.target.value });
                    setStepErrors((prev) => ({ ...prev, valuationAmount: undefined }));
                  }}
                  aria-invalid={Boolean(stepErrors.valuationAmount)}
                />
                {stepErrors.valuationAmount && (
                  <span className="ts-field-error" style={{ color: 'var(--ts-danger, #ef4444)', fontSize: '0.78rem' }}>
                    {stepErrors.valuationAmount}
                  </span>
                )}
              </div>

              <div className="ts-form-group">
                <label className="ts-label" htmlFor="val-cur">Currency</label>
                <select
                  id="val-cur"
                  className="ts-select"
                  value={formData.valuationCurrency}
                  onChange={(e) => setFormData({ ...formData, valuationCurrency: e.target.value })}
                >
                  <option value="INR">INR (₹)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                </select>
              </div>

              <div className="ts-form-group">
                <label className="ts-label" htmlFor="val-method">Valuation Methodology</label>
                <select
                  id="val-method"
                  className="ts-select"
                  value={formData.valuationMethod}
                  onChange={(e) => setFormData({ ...formData, valuationMethod: e.target.value })}
                >
                  <option value="APPROVED_VALUER">Approved Valuer Certified Appraisal</option>
                  <option value="MARKET_VALUE">Comparative Market Value</option>
                  <option value="AGE_BASED">Age-based / Straight-line Depreciation</option>
                </select>
              </div>

              <div className="ts-form-group">
                <label className="ts-label" htmlFor="val-valuer">
                  Valuer / Appraising Agency <span className="ts-required">*</span>
                </label>
                <input
                  id="val-valuer"
                  className={`ts-input ${stepErrors.valuerName ? 'ts-input-error' : ''}`}
                  placeholder="e.g. National Chartered Valuers Pvt. Ltd."
                  value={formData.valuerName}
                  onChange={(e) => {
                    setFormData({ ...formData, valuerName: e.target.value });
                    setStepErrors((prev) => ({ ...prev, valuerName: undefined }));
                  }}
                />
                {stepErrors.valuerName && (
                  <span className="ts-field-error" style={{ color: 'var(--ts-danger, #ef4444)', fontSize: '0.78rem' }}>
                    {stepErrors.valuerName}
                  </span>
                )}
              </div>

              <div className="ts-form-group">
                <label className="ts-label" htmlFor="val-date">
                  Valuation Date <span className="ts-required">*</span>
                </label>
                <input
                  id="val-date"
                  type="date"
                  className="ts-input"
                  value={formData.valuationDate}
                  onChange={(e) => setFormData({ ...formData, valuationDate: e.target.value })}
                />
              </div>
            </div>
          </Card>

          <div className="ts-step-action-row">
            <Button variant="secondary" onClick={handleBack}>
              &larr; Back
            </Button>
            <Button variant="primary" id="btn-valuation-next" onClick={handleNext}>
              Next: Review &rarr;
            </Button>
          </div>
        </div>
      )}

      {/* STEP 5: REVIEW & PREREQUISITES */}
      {currentStep === 5 && (
        <div className="ts-step-content">
          <h2 className="ts-section-heading">5. Review & Confirm Registration</h2>
          <Card>
            {/* Missing Prerequisites Warning if any */}
            {!canSubmit && (
              <div
                style={{
                  padding: '1rem',
                  borderRadius: '8px',
                  background: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid #f59e0b',
                  color: '#fef3c7',
                  marginBottom: '1.5rem',
                }}
                role="alert"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, color: '#f59e0b' }}>
                  <Icon name="shield-alert" size={18} />
                  <span>Mandatory Registration Prerequisites Incomplete</span>
                </div>
                <p style={{ margin: '0.5rem 0 0.5rem', fontSize: '0.85rem', color: '#fde68a' }}>
                  The registration transaction cannot be signed or committed to Fabric until all required fields are satisfied:
                </p>
                <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.82rem' }}>
                  {missingPrerequisites.map((req, idx) => (
                    <li key={idx} style={{ marginBottom: '0.2rem' }}>{req}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="ts-review-summary-grid">
              <div className="ts-passport-row">
                <span className="ts-pass-k">Asset Schema Type</span>
                <span className="ts-pass-v" style={{ textTransform: 'capitalize', fontWeight: 600 }}>
                  {selectedType}
                </span>
              </div>
              <div className="ts-passport-row">
                <span className="ts-pass-k">Asset ID</span>
                <span className="ts-pass-v ts-mono" style={{ fontWeight: 600, color: formData.assetId ? 'var(--ts-ink-heading)' : '#ef4444' }}>
                  {formData.assetId || '— Missing (Required)'}
                </span>
              </div>
              <div className="ts-passport-row">
                <span className="ts-pass-k">{activeTypeInfo.canonicalName}</span>
                <span className="ts-pass-v ts-mono">
                  {formData.canonicalIdentity || '— Missing (Required)'}
                </span>
              </div>
              <div className="ts-passport-row">
                <span className="ts-pass-k">Registering Owner (MSP)</span>
                <span className="ts-pass-v">
                  <code>{identity?.msp || 'IssuerOrg'}</code>
                </span>
              </div>
              <div className="ts-passport-row">
                <span className="ts-pass-k">Initial Valuation</span>
                <span className="ts-pass-v" style={{ fontWeight: 600 }}>
                  {formData.valuationAmount ? `${formData.valuationCurrency} ${Number(formData.valuationAmount).toLocaleString()}` : '— Missing (Required)'}
                </span>
              </div>
              <div className="ts-passport-row">
                <span className="ts-pass-k">Valuer Authority</span>
                <span className="ts-pass-v">{formData.valuerName || '— Missing'}</span>
              </div>
              <div className="ts-passport-row">
                <span className="ts-pass-k">Attached Evidence</span>
                <span className="ts-pass-v">
                  {formData.files.length} document(s) {formData.evidenceNote ? '+ Custody Reference' : ''}
                </span>
              </div>
            </div>

            {submitError && (
              <div style={{ marginTop: '1.25rem' }}>
                <ErrorState title="Registration Failed on Fabric" error={{ message: submitError }} />
              </div>
            )}
          </Card>

          <div className="ts-step-action-row">
            <Button variant="secondary" onClick={handleBack} disabled={submitting}>
              &larr; Back
            </Button>
            <Button
              variant="primary"
              id="btn-confirm-register"
              onClick={handleSubmit}
              disabled={submitting || !canSubmit}
            >
              {submitting ? 'Committing to Fabric...' : 'Confirm & Register Asset'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default RegisterAsset;