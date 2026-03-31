import type { Meta, StoryObj } from '@storybook/react';
import * as React from 'react';

import { StatusBadge } from './status-badge';

const meta: Meta<typeof StatusBadge> = {
  title: 'Components/StatusBadge',
  component: StatusBadge,
  tags: ['autodocs'],
  argTypes: {
    status: {
      control: 'select',
      options: ['success', 'warning', 'danger', 'info', 'neutral'],
    },
    dot: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof StatusBadge>;

export const Success: Story = {
  args: {
    status: 'success',
    children: 'Active',
  },
};

export const Warning: Story = {
  args: {
    status: 'warning',
    children: 'Pending Review',
  },
};

export const Danger: Story = {
  args: {
    status: 'danger',
    children: 'Suspended',
  },
};

export const Info: Story = {
  args: {
    status: 'info',
    children: 'In Progress',
  },
};

export const Neutral: Story = {
  args: {
    status: 'neutral',
    children: 'Archived',
  },
};

export const WithDot: Story = {
  args: {
    status: 'success',
    dot: true,
    children: 'Active',
  },
};

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      <StatusBadge status="success">Active</StatusBadge>
      <StatusBadge status="warning">Pending</StatusBadge>
      <StatusBadge status="danger">Suspended</StatusBadge>
      <StatusBadge status="info">In Progress</StatusBadge>
      <StatusBadge status="neutral">Archived</StatusBadge>
    </div>
  ),
};

export const AllVariantsWithDot: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      <StatusBadge status="success" dot>
        Active
      </StatusBadge>
      <StatusBadge status="warning" dot>
        Pending
      </StatusBadge>
      <StatusBadge status="danger" dot>
        Suspended
      </StatusBadge>
      <StatusBadge status="info" dot>
        In Progress
      </StatusBadge>
      <StatusBadge status="neutral" dot>
        Archived
      </StatusBadge>
    </div>
  ),
};
