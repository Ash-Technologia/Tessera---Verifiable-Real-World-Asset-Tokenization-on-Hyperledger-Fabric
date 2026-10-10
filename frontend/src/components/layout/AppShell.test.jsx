import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { IdentityProvider } from '../../context/IdentityContext.jsx';
import { AppShell } from './AppShell.jsx';

function renderShell(path = '/assets') {
  return render(
    <IdentityProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppShell title="TESSERA Console" fabricStatus={<span>ok</span>}>
          <p>page body</p>
        </AppShell>
      </MemoryRouter>
    </IdentityProvider>,
  );
}

describe('application shell', () => {
  it('renders brand, navigation, identity and content', () => {
    renderShell();
    expect(screen.getByText('TESSERA')).toBeInTheDocument();
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Assets')).toBeInTheDocument();
    expect(screen.getByText('Operational Health')).toBeInTheDocument();
    expect(screen.getByText('page body')).toBeInTheDocument();
    expect(screen.getByText('frontend-service-identity')).toBeInTheDocument();
    expect(screen.getByText(/IssuerMSP/)).toBeInTheDocument();
  });

  it('marks the active navigation link', () => {
    renderShell('/assets');
    const assetsLink = screen.getByRole('link', { name: 'Assets' });
    expect(assetsLink.className).toMatch(/is-active/);
  });

  it('labels future-phase routes without fabricating their pages', () => {
    renderShell('/');
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getAllByText('8B').length).toBeGreaterThan(0);
  });
});
