import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge, statusToneFor } from './StatusBadge.jsx';

describe('StatusBadge', () => {
  it('maps verified/active lifecycle states to the success tone', () => {
    expect(statusToneFor('VERIFIED')).toBe('green');
    expect(statusToneFor('TOKENIZED')).toBe('teal');
    expect(statusToneFor('PLEDGED')).toBe('gold');
    expect(statusToneFor('RESTRICTED')).toBe('red');
    expect(statusToneFor('UNDER_VERIFICATION')).toBe('amber');
    expect(statusToneFor('SOME_FUTURE_STATE')).toBe('neutral');
    expect(statusToneFor(null)).toBe('neutral');
  });

  it('renders the API-provided status text (never a hardcoded label)', () => {
    render(<StatusBadge status="PLEDGED" />);
    expect(screen.getByText('PLEDGED')).toBeInTheDocument();
  });
});
