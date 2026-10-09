import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ApiError, ApiErrorKind } from '../../services/api/client.js';
import { EmptyState, ErrorState, LoadingState } from './States.jsx';

describe('shared async states', () => {
  it('loading state announces politely', () => {
    render(<LoadingState message="Reading assets…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Reading assets…');
  });

  it('empty state renders title and detail', () => {
    render(<EmptyState title="No assets" detail="Seed the network first." />);
    expect(screen.getByText('No assets')).toBeInTheDocument();
    expect(screen.getByText('Seed the network first.')).toBeInTheDocument();
  });

  it('error state shows message, guidance and a working retry button', () => {
    const onRetry = vi.fn();
    const error = new ApiError({ kind: ApiErrorKind.FABRIC_UNAVAILABLE, status: 503, message: 'down', path: '/x' });
    render(<ErrorState title="Load failed" error={error} onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('down');
    expect(screen.getByRole('alert')).toHaveTextContent(/Fabric network is unreachable/);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('error state never renders stack traces', () => {
    const error = new ApiError({ kind: ApiErrorKind.UNEXPECTED, status: 500, message: 'boom', path: '/x' });
    error.stack = 'Error: boom\n    at secret.js:1:1';
    const { container } = render(<ErrorState error={error} />);
    expect(container.textContent).not.toMatch(/secret\.js/);
  });
});
