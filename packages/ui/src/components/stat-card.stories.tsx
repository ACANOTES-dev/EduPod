import type { Meta, StoryObj } from '@storybook/react';
import * as React from 'react';

import { StatCard } from './stat-card';

const meta: Meta<typeof StatCard> = {
  title: 'Components/StatCard',
  component: StatCard,
  tags: ['autodocs'],
  argTypes: {
    trend: { control: false },
  },
};

export default meta;
type Story = StoryObj<typeof StatCard>;

export const Default: Story = {
  args: {
    label: 'Total Students',
    value: 248,
  },
};

export const WithTrendUp: Story = {
  args: {
    label: 'Attendance Rate',
    value: 94,
    trend: { direction: 'up', label: '3% vs last month' },
  },
};

export const WithTrendDown: Story = {
  args: {
    label: 'Absences Today',
    value: 12,
    trend: { direction: 'down', label: '2 fewer than yesterday' },
  },
};

export const WithTrendNeutral: Story = {
  args: {
    label: 'Open Enquiries',
    value: 5,
    trend: { direction: 'neutral', label: 'No change' },
  },
};

export const StringValue: Story = {
  args: {
    label: 'Academic Year',
    value: '2025–2026',
  },
};

export const Dashboard: Story = {
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
      <StatCard
        label="Total Students"
        value={248}
        trend={{ direction: 'up', label: '12 new this term' }}
      />
      <StatCard
        label="Attendance Rate"
        value={94}
        trend={{ direction: 'up', label: '3% vs last month' }}
      />
      <StatCard
        label="Pending Fees"
        value={18}
        trend={{ direction: 'down', label: '5 resolved this week' }}
      />
      <StatCard
        label="Staff On Leave"
        value={2}
        trend={{ direction: 'neutral', label: 'No change' }}
      />
    </div>
  ),
};
