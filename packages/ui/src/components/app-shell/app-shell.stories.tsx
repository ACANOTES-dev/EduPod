import type { Meta, StoryObj } from '@storybook/react';
import * as React from 'react';

import { AppShell } from './app-shell';

const meta: Meta<typeof AppShell> = {
  title: 'Components/AppShell',
  component: AppShell,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof AppShell>;

function SampleMorphBar() {
  return (
    <div
      style={{
        height: '56px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        background: '#1C1917',
        color: '#FAFAF9',
      }}
    >
      <strong style={{ fontSize: '16px' }}>EduPod</strong>
      <div style={{ display: 'flex', gap: '12px', fontSize: '13px' }}>
        <span>Home</span>
        <span>People</span>
        <span>Learning</span>
        <span>Operations</span>
      </div>
      <span style={{ fontSize: '13px', opacity: 0.8 }}>RA</span>
    </div>
  );
}

function SampleSubStrip() {
  return (
    <div
      style={{
        height: '44px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '0 24px',
        background: '#292524',
        color: '#D6D3D1',
        fontSize: '12px',
        fontWeight: 600,
      }}
    >
      <span style={{ color: '#F5F5F4' }}>Dashboard</span>
      <span>Attendance</span>
      <span>Reports</span>
      <span>Analytics</span>
    </div>
  );
}

export const Default: Story = {
  render: () => {
    return (
      <div style={{ height: '100vh' }}>
        <AppShell morphBar={<SampleMorphBar />} subStrip={<SampleSubStrip />}>
          <div style={{ padding: '8px' }}>
            <h2
              style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px', color: '#1C1917' }}
            >
              Welcome back
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              {[
                { label: 'Total Students', value: '248' },
                { label: 'Attendance Rate', value: '94%' },
                { label: 'Staff Active', value: '32' },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  style={{ background: '#F5F5F4', borderRadius: '16px', padding: '20px' }}
                >
                  <p
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: '#A8A29E',
                      marginBottom: '4px',
                    }}
                  >
                    {label}
                  </p>
                  <p style={{ fontSize: '28px', fontWeight: 600, color: '#1C1917' }}>{value}</p>
                </div>
              ))}
            </div>
          </div>
        </AppShell>
      </div>
    );
  },
};

export const CollapsedSidebar: Story = {
  render: () => {
    return (
      <div style={{ height: '100vh' }}>
        <AppShell morphBar={<SampleMorphBar />}>
          <p style={{ color: '#78716C', fontSize: '14px' }}>
            The shell can also render without a sub-strip when the current hub has no secondary
            tabs.
          </p>
        </AppShell>
      </div>
    );
  },
};
