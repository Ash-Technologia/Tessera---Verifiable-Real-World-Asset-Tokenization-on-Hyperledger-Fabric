import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Login } from './Login.jsx';
import { IdentityProvider, UNAUTHENTICATED_IDENTITY } from '../context/IdentityContext.jsx';
import { authApi } from '../services/api/auth.js';

vi.mock('../services/api/auth.js', () => ({
  authApi: {
    login: vi.fn(),
    me: vi.fn().mockRejectedValue(new Error('unauthenticated')),
    getPersonas: vi.fn().mockResolvedValue([]),
    logout: vi.fn().mockResolvedValue({ success: true }),
  },
}));

function renderLogin() {
  return render(
    <IdentityProvider initialIdentity={UNAUTHENTICATED_IDENTITY}>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<div>Dashboard Workspace</div>} />
        </Routes>
      </MemoryRouter>
    </IdentityProvider>
  );
}

describe('Login Workspace & Auth Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders enterprise persona options and custom credential tabs', () => {
    renderLogin();
    expect(screen.getByRole('heading', { name: 'TESSERA' })).toBeInTheDocument();
    expect(screen.getByText(/Enterprise Personas \(Dev \/ Demo\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Custom Credentials \/ OIDC/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Alice Issuer/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Bob Verifier/i)).toBeInTheDocument();
    expect(screen.getByText(/Dave Compliance/i)).toBeInTheDocument();
  });

  it('authenticates via persona selector and redirects to destination', async () => {
    authApi.login.mockResolvedValueOnce({
      success: true,
      token: 'mock-jwt-token-xyz',
      user: {
        userId: 'issuer-operator',
        name: 'Alice Issuer',
        organization: 'IssuerMSP',
        role: 'ISSUER',
        permissions: ['assets:create', 'assets:read'],
      },
    });

    renderLogin();

    const signInBtn = screen.getByRole('button', { name: /Sign In as Selected Persona/i });
    fireEvent.click(signInBtn);

    await waitFor(() => {
      expect(authApi.login).toHaveBeenCalledWith('issuer-operator');
      expect(screen.getByText(/Dashboard Workspace/i)).toBeInTheDocument();
    });
  });

  it('displays authentication failure alert when backend rejects credentials', async () => {
    authApi.login.mockRejectedValueOnce(new Error('Unknown principal or invalid secret'));

    renderLogin();

    const signInBtn = screen.getByRole('button', { name: /Sign In as Selected Persona/i });
    fireEvent.click(signInBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Unknown principal or invalid secret/i);
    });
  });

  it('switches to Custom Credentials tab and submits custom User ID', async () => {
    authApi.login.mockResolvedValueOnce({
      success: true,
      token: 'custom-token',
      user: {
        userId: 'custom-officer',
        name: 'Custom User',
        organization: 'IssuerMSP',
        role: 'ISSUER',
        permissions: ['*'],
      },
    });

    renderLogin();

    const credTab = screen.getByRole('tab', { name: /Custom Credentials \/ OIDC/i });
    fireEvent.click(credTab);

    const usernameInput = screen.getByLabelText(/User ID \/ Persona ID/i);
    fireEvent.change(usernameInput, { target: { value: 'custom-officer' } });

    const submitBtn = screen.getByRole('button', { name: /Sign In with Credentials/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(authApi.login).toHaveBeenCalledWith('custom-officer');
      expect(screen.getByText(/Dashboard Workspace/i)).toBeInTheDocument();
    });
  });
});
