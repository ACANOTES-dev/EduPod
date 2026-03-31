import type { Meta, StoryObj } from '@storybook/react';
import { BookOpen, GraduationCap, Home, Settings, Users } from 'lucide-react';
import * as React from 'react';

import { AppShell } from './app-shell';
import { Sidebar } from './sidebar';
import { SidebarItem } from './sidebar-item';
import { SidebarSection } from './sidebar-section';
import { TopBar } from './top-bar';

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

function SampleSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <Sidebar
      collapsed={collapsed}
      onToggle={onToggle}
      header={
        !collapsed ? (
          <span style={{ fontWeight: 700, fontSize: '16px', color: '#059669' }}>EduPod</span>
        ) : (
          <span style={{ fontWeight: 700, fontSize: '16px', color: '#059669' }}>E</span>
        )
      }
    >
      <SidebarSection label="Main" collapsed={collapsed}>
        <SidebarItem icon={Home} label="Dashboard" active collapsed={collapsed} />
        <SidebarItem icon={Users} label="Students" collapsed={collapsed} />
        <SidebarItem icon={GraduationCap} label="Classes" collapsed={collapsed} />
        <SidebarItem icon={BookOpen} label="Subjects" collapsed={collapsed} />
      </SidebarSection>
      <SidebarSection label="Admin" collapsed={collapsed}>
        <SidebarItem icon={Settings} label="Settings" collapsed={collapsed} />
      </SidebarSection>
    </Sidebar>
  );
}

function SampleTopBar({ onMenuClick }: { onMenuClick?: () => void }) {
  return (
    <TopBar
      leading={
        onMenuClick ? (
          <button onClick={onMenuClick} style={{ padding: '4px', cursor: 'pointer' }}>
            ☰
          </button>
        ) : undefined
      }
      title="Dashboard"
      actions={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px', color: '#78716C' }}>Academic Year 2025–26</span>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: '#D1FAE5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 600,
              color: '#065F46',
              fontSize: '13px',
            }}
          >
            RA
          </div>
        </div>
      }
    />
  );
}

export const Default: Story = {
  render: () => {
    const [collapsed, setCollapsed] = React.useState(false);
    return (
      <div style={{ height: '100vh' }}>
        <AppShell
          sidebar={<SampleSidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />}
          topBar={<SampleTopBar />}
        >
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
    const [collapsed, setCollapsed] = React.useState(true);
    return (
      <div style={{ height: '100vh' }}>
        <AppShell
          sidebar={<SampleSidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />}
          topBar={<SampleTopBar />}
        >
          <p style={{ color: '#78716C', fontSize: '14px' }}>
            The sidebar is collapsed. Click the toggle button at the bottom of the sidebar to expand
            it.
          </p>
        </AppShell>
      </div>
    );
  },
};
